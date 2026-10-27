package in.aggarwaljeweller.counter;

import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/** Retry only a failed main-page GET. Never reload a healthy page or replay a bill submission. */
final class ConnectionRecoveryClient extends BridgeWebViewClient {
    private final Bridge bridge;
    private final ConnectivityManager connectivity;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final RecoveryState state = new RecoveryState();
    private boolean listening;
    private final Runnable retry = this::retryIfOffline;
    private final ConnectivityManager.NetworkCallback networkCallback = new ConnectivityManager.NetworkCallback() {
        @Override
        public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
            if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                handler.post(() -> schedule(1000));
            }
        }
    };

    ConnectionRecoveryClient(Bridge bridge, ConnectivityManager connectivity) {
        super(bridge);
        this.bridge = bridge;
        this.connectivity = connectivity;
    }

    void resume() {
        state.foreground = true;
        if (connectivity != null && !listening) {
            try {
                connectivity.registerDefaultNetworkCallback(networkCallback);
                listening = true;
            } catch (RuntimeException ignored) { /* Timed retry still works if monitoring is unavailable. */ }
        }
        schedule(1000); // Allow Wi-Fi/mobile data to settle after returning from another app.
    }

    void pause() {
        state.foreground = false;
        handler.removeCallbacksAndMessages(null);
        if (listening) {
            try { connectivity.unregisterNetworkCallback(networkCallback); }
            catch (RuntimeException ignored) { }
            listening = false;
        }
    }

    private void schedule(long delay) {
        handler.removeCallbacks(retry);
        if (state.foreground && state.target != null) handler.postDelayed(retry, delay);
    }

    private boolean isOffline(String url) {
        return bridge.getErrorUrl() != null && bridge.getErrorUrl().equals(url);
    }

    private boolean connected() {
        if (connectivity == null) return false;
        NetworkCapabilities caps = connectivity.getNetworkCapabilities(connectivity.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    private void retryIfOffline() {
        WebView view = bridge.getWebView();
        if (!state.canRetry(isOffline(view.getUrl()))) return;
        if (connected()) view.loadUrl(state.target);
        // If loading fails, onPageFinished(error page) schedules the next attempt.
        else schedule(state.nextDelay());
    }

    private boolean safeGet(WebResourceRequest request) {
        Uri server = Uri.parse(bridge.getServerUrl());
        Uri url = request.getUrl();
        return request.isForMainFrame() && "GET".equals(request.getMethod())
            && server.getScheme().equals(url.getScheme())
            && server.getAuthority().equals(url.getAuthority());
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request.isForMainFrame()) {
            int code = error.getErrorCode();
            boolean transientError = code == ERROR_HOST_LOOKUP || code == ERROR_CONNECT
                || code == ERROR_TIMEOUT || code == ERROR_IO;
            state.failed(safeGet(request) && transientError ? request.getUrl().toString() : null);
        }
        super.onReceivedError(view, request, error);
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
        if (request.isForMainFrame()) {
            state.failed(safeGet(request) && response.getStatusCode() >= 500
                ? request.getUrl().toString() : null);
        }
        super.onReceivedHttpError(view, request, response);
    }

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        handler.removeCallbacks(retry);
        super.onPageStarted(view, url, favicon);
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        // Ignore stale finish callbacks from a failed navigation after the error page replaces it.
        if (!url.equals(view.getUrl())) return;
        if (isOffline(url)) schedule(state.nextDelay());
    }

    @Override
    public void onPageCommitVisible(WebView view, String url) {
        super.onPageCommitVisible(view, url);
        // A failed page can also emit onPageFinished; only a committed live page is recovery.
        if (!isOffline(url) && url.equals(view.getUrl())) state.recovered();
    }
}
