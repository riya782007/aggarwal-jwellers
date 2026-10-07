package in.aggarwaljeweller.counter;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugin: Bluetooth label printing, Android print screen, saving exports (AjPrinterPlugin).
        registerPlugin(AjPrinterPlugin.class);
        super.onCreate(savedInstanceState);

        // Android back button = "previous page" (like the browser). On the first page it only
        // minimises the app, so a bill in progress and the login are never thrown away.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                if (wv != null && wv.canGoBack()) wv.goBack();
                else moveTaskToBack(true);
            }
        });
    }

    @Override
    public void onPause() {
        super.onPause();
        // Write the login cookie to disk now, so swiping the app away never logs staff out early.
        CookieManager.getInstance().flush();
    }
}
