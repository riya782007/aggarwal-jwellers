package in.aggarwaljeweller.counter;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothSocket;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * AjPrinter — Bluetooth label printing for the Aggarwal Jewellers app.
 *
 * JS (lib/nativeBridge.ts) calls:
 *   listDevices({scan})            paired devices, plus nearby ones when scan=true
 *   write({address, type, data})   send TSPL/ESC-POS text to the printer
 *   printPage({name})              Android print screen for the current page (A4 bills)
 *   disconnect()
 *
 *   saveFile({name, mime, data})   save an export (Excel / CSV / PDF) to Downloads/Aggarwal and
 *                                  open the share sheet — browsers' "download" doesn't exist in apps
 *
 * Works with both kinds of printer: Classic Bluetooth (SPP, most label printers) and BLE.
 * Connections are kept open between prints for speed and closed after 60 s idle.
 */
@CapacitorPlugin(
    name = "AjPrinter",
    permissions = {
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class AjPrinterPlugin extends Plugin {

    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final long IDLE_CLOSE_MS = 60_000;
    private static final long SCAN_MS = 6_000;

    /** Write characteristics used by common thermal printers, tried before any generic one. */
    private static final String[] KNOWN_WRITE_CHARS = {
        "00002af1-0000-1000-8000-00805f9b34fb",
        "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
        "49535343-8841-43f4-a8d4-ecbe34729bb3",
        "0000ff02-0000-1000-8000-00805f9b34fb",
        "0000fff2-0000-1000-8000-00805f9b34fb",
    };

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable idleClose = this::closeAll;

    private BluetoothSocket spp;
    private String sppAddress;

    private BluetoothGatt gatt;
    private String gattAddress;
    private BluetoothGattCharacteristic gattChar;
    private int gattChunk = 20;
    private volatile CountDownLatch gattLatch;
    private volatile int gattStatus;

    // ---------------------------------------------------------------- permissions

    private String permAlias(boolean scan) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return "bluetooth";
        return scan ? "location" : null; // pre-Android 12: connecting needs no runtime permission
    }

    /** True if granted now; otherwise asks and re-enters via the named callback. */
    private boolean ensurePermission(PluginCall call, boolean scan, String callback) {
        String alias = permAlias(scan);
        if (alias == null || getPermissionState(alias) == PermissionState.GRANTED) return true;
        requestPermissionForAlias(alias, call, callback);
        return false;
    }

    private boolean permissionOk(boolean scan) {
        String alias = permAlias(scan);
        return alias == null || getPermissionState(alias) == PermissionState.GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return bm == null ? null : bm.getAdapter();
    }

    private static String typeName(int t) {
        switch (t) {
            case BluetoothDevice.DEVICE_TYPE_CLASSIC: return "classic";
            case BluetoothDevice.DEVICE_TYPE_LE: return "le";
            case BluetoothDevice.DEVICE_TYPE_DUAL: return "dual";
            default: return "unknown";
        }
    }

    @SuppressLint("MissingPermission")
    private static JSObject describe(BluetoothDevice d, boolean bonded) {
        JSObject o = new JSObject();
        String name = null;
        int type = BluetoothDevice.DEVICE_TYPE_UNKNOWN;
        try { name = d.getName(); type = d.getType(); } catch (SecurityException ignored) { }
        o.put("name", name == null ? "" : name);
        o.put("address", d.getAddress());
        o.put("type", typeName(type));
        o.put("bonded", bonded);
        return o;
    }

    // ---------------------------------------------------------------- listDevices

    @PluginMethod
    public void listDevices(PluginCall call) {
        boolean scan = Boolean.TRUE.equals(call.getBoolean("scan", false));
        if (!ensurePermission(call, scan, "listDevicesAfterPermission")) return;
        doList(call, scan);
    }

    @PermissionCallback
    private void listDevicesAfterPermission(PluginCall call) {
        boolean scan = Boolean.TRUE.equals(call.getBoolean("scan", false));
        if (!permissionOk(scan)) { call.reject("Bluetooth permission was not allowed"); return; }
        doList(call, scan);
    }

    @SuppressLint("MissingPermission")
    private void doList(PluginCall call, boolean scan) {
        BluetoothAdapter a = adapter();
        if (a == null) { call.reject("This phone has no Bluetooth adapter"); return; }
        if (!a.isEnabled()) { call.reject("Bluetooth is off"); return; }

        final Map<String, JSObject> found = new LinkedHashMap<>();
        try {
            for (BluetoothDevice d : a.getBondedDevices()) found.put(d.getAddress(), describe(d, true));
        } catch (SecurityException e) { call.reject("Bluetooth permission was not allowed"); return; }

        if (!scan) { resolveDevices(call, found); return; }

        // Classic discovery (most label printers) + BLE scan, together, for SCAN_MS.
        final BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                if (!BluetoothDevice.ACTION_FOUND.equals(i.getAction())) return;
                BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (d == null) return;
                synchronized (found) { if (!found.containsKey(d.getAddress())) found.put(d.getAddress(), describe(d, false)); }
            }
        };
        final ScanCallback le = new ScanCallback() {
            @Override public void onScanResult(int cb, ScanResult r) {
                BluetoothDevice d = r.getDevice();
                if (d == null) return;
                synchronized (found) { if (!found.containsKey(d.getAddress())) found.put(d.getAddress(), describe(d, false)); }
            }
        };
        final BluetoothLeScanner scanner = a.getBluetoothLeScanner();
        try {
            ContextCompat.registerReceiver(getContext(), receiver, new IntentFilter(BluetoothDevice.ACTION_FOUND), ContextCompat.RECEIVER_EXPORTED);
            a.startDiscovery();
            if (scanner != null) scanner.startScan(le);
        } catch (SecurityException e) {
            try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) { }
            call.reject("Bluetooth permission was not allowed");
            return;
        }
        main.postDelayed(() -> {
            try { a.cancelDiscovery(); } catch (SecurityException ignored) { }
            try { if (scanner != null) scanner.stopScan(le); } catch (Exception ignored) { }
            try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) { }
            synchronized (found) {
                // Unnamed BLE beacons are noise for a shop; keep named ones and paired ones.
                Map<String, JSObject> named = new LinkedHashMap<>();
                for (Map.Entry<String, JSObject> e : found.entrySet()) {
                    String n = e.getValue().getString("name");
                    if (Boolean.TRUE.equals(e.getValue().getBool("bonded")) || (n != null && !n.isEmpty())) named.put(e.getKey(), e.getValue());
                }
                resolveDevices(call, named);
            }
        }, SCAN_MS);
    }

    private static void resolveDevices(PluginCall call, Map<String, JSObject> found) {
        JSArray arr = new JSArray();
        for (JSObject o : found.values()) arr.put(o);
        JSObject ret = new JSObject();
        ret.put("devices", arr);
        call.resolve(ret);
    }

    // ---------------------------------------------------------------- write

    @PluginMethod
    public void write(PluginCall call) {
        if (!ensurePermission(call, false, "writeAfterPermission")) return;
        doWrite(call);
    }

    @PermissionCallback
    private void writeAfterPermission(PluginCall call) {
        if (!permissionOk(false)) { call.reject("Bluetooth permission was not allowed"); return; }
        doWrite(call);
    }

    private void doWrite(PluginCall call) {
        final String address = call.getString("address");
        final String type = call.getString("type", "unknown");
        final String data = call.getString("data", "");
        if (address == null || address.isEmpty()) { call.reject("No printer selected"); return; }
        BluetoothAdapter a = adapter();
        if (a == null) { call.reject("This phone has no Bluetooth adapter"); return; }
        if (!a.isEnabled()) { call.reject("Bluetooth is off"); return; }
        final byte[] bytes = data.getBytes(StandardCharsets.US_ASCII);

        io.execute(() -> {
            main.removeCallbacks(idleClose);
            try {
                if ("le".equals(type)) {
                    bleWrite(a, address, bytes);
                } else {
                    try {
                        sppWrite(a, address, bytes);
                    } catch (IOException sppErr) {
                        if (!"dual".equals(type) && !"unknown".equals(type)) throw sppErr;
                        closeSpp();
                        bleWrite(a, address, bytes);
                    }
                }
                call.resolve();
            } catch (SecurityException e) {
                call.reject("Bluetooth permission was not allowed");
            } catch (Exception e) {
                closeAll();
                call.reject("Printer not reachable: " + e.getMessage());
            } finally {
                main.postDelayed(idleClose, IDLE_CLOSE_MS);
            }
        });
    }

    // ---- Classic SPP

    @SuppressLint("MissingPermission")
    private void sppWrite(BluetoothAdapter a, String address, byte[] bytes) throws IOException {
        if (spp == null || !spp.isConnected() || !address.equals(sppAddress)) {
            closeSpp();
            BluetoothDevice d = a.getRemoteDevice(address);
            try { a.cancelDiscovery(); } catch (SecurityException ignored) { }
            spp = connectSpp(d);
            sppAddress = address;
        }
        OutputStream out = spp.getOutputStream();
        int chunk = 512;
        for (int i = 0; i < bytes.length; i += chunk) {
            out.write(bytes, i, Math.min(chunk, bytes.length - i));
            out.flush();
            sleep(8); // cheap printers have small receive buffers
        }
    }

    @SuppressLint("MissingPermission")
    private static BluetoothSocket connectSpp(BluetoothDevice d) throws IOException {
        IOException last = null;
        // 1) secure SPP, 2) insecure SPP, 3) channel 1 via reflection — covers almost every printer.
        try { BluetoothSocket s = d.createRfcommSocketToServiceRecord(SPP_UUID); s.connect(); return s; }
        catch (IOException e) { last = e; }
        try { BluetoothSocket s = d.createInsecureRfcommSocketToServiceRecord(SPP_UUID); s.connect(); return s; }
        catch (IOException e) { last = e; }
        try {
            Method m = d.getClass().getMethod("createRfcommSocket", int.class);
            BluetoothSocket s = (BluetoothSocket) m.invoke(d, 1);
            if (s != null) { s.connect(); return s; }
        } catch (IOException e) { last = e; } catch (Exception ignored) { }
        throw last != null ? last : new IOException("SPP connect failed");
    }

    private void closeSpp() {
        if (spp != null) { try { spp.close(); } catch (IOException ignored) { } }
        spp = null;
        sppAddress = null;
    }

    // ---- BLE

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        @Override public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            gattStatus = status;
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                if (!g.requestMtu(247)) g.discoverServices();
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                gattChar = null;
                release();
            }
        }
        @SuppressLint("MissingPermission")
        @Override public void onMtuChanged(BluetoothGatt g, int mtu, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) gattChunk = Math.max(20, mtu - 3);
            g.discoverServices();
        }
        @Override public void onServicesDiscovered(BluetoothGatt g, int status) {
            gattStatus = status;
            if (status == BluetoothGatt.GATT_SUCCESS) gattChar = pickWriteChar(g.getServices());
            release();
        }
        @Override public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
            gattStatus = status;
            release();
        }
        private void release() { CountDownLatch l = gattLatch; if (l != null) l.countDown(); }
    };

    private static BluetoothGattCharacteristic pickWriteChar(List<BluetoothGattService> services) {
        BluetoothGattCharacteristic any = null;
        for (BluetoothGattService s : services) {
            for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
                int p = c.getProperties();
                boolean writable = (p & (BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE)) != 0;
                if (!writable) continue;
                String id = c.getUuid().toString().toLowerCase();
                for (String k : KNOWN_WRITE_CHARS) if (k.equals(id)) return c;
                if (any == null) any = c;
            }
        }
        return any;
    }

    private boolean await(long ms) throws InterruptedException {
        CountDownLatch l = gattLatch;
        return l != null && l.await(ms, TimeUnit.MILLISECONDS);
    }

    @SuppressLint("MissingPermission")
    private void bleWrite(BluetoothAdapter a, String address, byte[] bytes) throws Exception {
        if (gatt == null || gattChar == null || !address.equals(gattAddress)) {
            closeGatt();
            BluetoothDevice d = a.getRemoteDevice(address);
            gattLatch = new CountDownLatch(1);
            gattAddress = address;
            gatt = d.connectGatt(getContext(), false, gattCallback, BluetoothDevice.TRANSPORT_LE);
            if (!await(12_000) || gattChar == null) throw new IOException("BLE printer did not answer");
        }
        boolean noResponse = (gattChar.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0;
        int type = noResponse ? BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE : BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT;
        for (int i = 0; i < bytes.length; i += gattChunk) {
            byte[] part = new byte[Math.min(gattChunk, bytes.length - i)];
            System.arraycopy(bytes, i, part, 0, part.length);
            gattLatch = new CountDownLatch(1);
            boolean queued = writeChar(part, type);
            if (!queued) { sleep(30); queued = writeChar(part, type); }
            if (!queued) throw new IOException("BLE write was refused");
            if (noResponse) sleep(12); else if (!await(3_000)) throw new IOException("BLE write timed out");
        }
    }

    @SuppressLint("MissingPermission")
    @SuppressWarnings("deprecation")
    private boolean writeChar(byte[] part, int type) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return gatt.writeCharacteristic(gattChar, part, type) == BluetoothGatt.GATT_SUCCESS;
        }
        gattChar.setWriteType(type);
        gattChar.setValue(part);
        return gatt.writeCharacteristic(gattChar);
    }

    @SuppressLint("MissingPermission")
    private void closeGatt() {
        if (gatt != null) {
            try { gatt.disconnect(); } catch (SecurityException ignored) { }
            try { gatt.close(); } catch (SecurityException ignored) { }
        }
        gatt = null;
        gattChar = null;
        gattAddress = null;
    }

    private void closeAll() { closeSpp(); closeGatt(); }

    private static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }

    // ---------------------------------------------------------------- printPage / disconnect

    @PluginMethod
    public void printPage(PluginCall call) {
        final String name = call.getString("name", "Aggarwal Jewellers");
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                WebView wv = getBridge().getWebView();
                PrintDocumentAdapter adapter = wv.createPrintDocumentAdapter(name);
                PrintAttributes attrs = new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build();
                pm.print(name, adapter, attrs);
                call.resolve();
            } catch (Exception e) {
                call.reject("Could not open the print screen: " + e.getMessage());
            }
        });
    }

    // ---------------------------------------------------------------- saveFile

    private static String safeName(String raw) {
        String n = raw == null ? "" : raw.replaceAll("[\\\\/:*?\"<>|\\r\\n]+", "_").trim();
        return n.isEmpty() ? "aggarwal-export" : (n.length() > 120 ? n.substring(n.length() - 120) : n);
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        final String name = safeName(call.getString("name", "aggarwal-export"));
        final String mime = call.getString("mime", "application/octet-stream");
        final String data = call.getString("data", "");
        final boolean share = Boolean.TRUE.equals(call.getBoolean("share", true));
        io.execute(() -> {
            try {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                String savedTo = null;

                // 1) Public Downloads/Aggarwal (Android 10+, no permission needed) — findable in Files.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver cr = getContext().getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Aggarwal");
                    Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri != null) {
                        try (java.io.OutputStream os = cr.openOutputStream(uri)) {
                            if (os != null) { os.write(bytes); savedTo = "Downloads/Aggarwal/" + name; }
                        }
                    }
                }

                // 2) Private copy for the share sheet (WhatsApp, Drive, print apps…).
                File dir = new File(getContext().getCacheDir(), "exports");
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("cannot create export folder");
                File f = new File(dir, name);
                try (FileOutputStream fos = new FileOutputStream(f)) { fos.write(bytes); }
                final Uri shareUri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
                final String where = savedTo;

                getActivity().runOnUiThread(() -> {
                    Toast.makeText(getContext(), where != null ? "Saved to " + where : "File ready", Toast.LENGTH_SHORT).show();
                    if (share) {
                        Intent send = new Intent(Intent.ACTION_SEND);
                        send.setType(mime);
                        send.putExtra(Intent.EXTRA_STREAM, shareUri);
                        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        Intent view = new Intent(Intent.ACTION_VIEW);
                        view.setDataAndType(shareUri, mime);
                        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        Intent chooser = Intent.createChooser(send, "Open or share " + name);
                        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { view });
                        try { getActivity().startActivity(chooser); } catch (Exception ignored) { }
                    }
                });
                JSObject ret = new JSObject();
                ret.put("savedTo", where);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Could not save the file: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        io.execute(() -> { closeAll(); call.resolve(); });
    }

    @Override
    protected void handleOnDestroy() {
        main.removeCallbacks(idleClose);
        io.execute(this::closeAll);
        io.shutdown();
    }
}
