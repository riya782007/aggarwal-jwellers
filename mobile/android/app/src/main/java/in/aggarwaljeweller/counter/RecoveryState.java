package in.aggarwaljeweller.counter;

/** Small Android-independent policy so retries cannot refresh a working/background screen. */
final class RecoveryState {
    String target;
    boolean foreground;
    private long delay = 2000;

    void failed(String url) {
        if (target == null || !target.equals(url)) delay = 2000;
        target = url;
    }

    boolean canRetry(boolean offlinePage) {
        return foreground && offlinePage && target != null;
    }

    long nextDelay() {
        long result = delay;
        delay = Math.min(delay * 2, 30000);
        return result;
    }

    void recovered() {
        target = null;
        delay = 2000;
    }
}
