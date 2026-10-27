package in.aggarwaljeweller.counter;

import org.junit.Test;
import static org.junit.Assert.*;

public class RecoveryStateTest {
    @Test public void neverReloadHealthyPageOrBackgroundApp() {
        RecoveryState state = new RecoveryState();
        state.failed("https://example.test/admin/pos");
        assertFalse(state.canRetry(true));
        state.foreground = true;
        assertFalse(state.canRetry(false));
        assertTrue(state.canRetry(true));
        state.foreground = false;
        assertFalse(state.canRetry(true));
    }

    @Test public void resumesFailedRouteAndStopsAfterRecovery() {
        RecoveryState state = new RecoveryState();
        state.foreground = true;
        state.failed("https://example.test/admin/pos?mode=cash");
        assertEquals("https://example.test/admin/pos?mode=cash", state.target);
        state.recovered();
        assertNull(state.target);
        assertFalse(state.canRetry(true));
        assertEquals(2000, state.nextDelay());
    }

    @Test public void repeatedFailuresBackOffAndCapAtThirtySeconds() {
        RecoveryState state = new RecoveryState();
        state.failed("https://example.test/admin");
        for (long expected : new long[]{2000, 4000, 8000, 16000, 30000, 30000}) {
            assertEquals(expected, state.nextDelay());
            state.failed("https://example.test/admin");
        }
        state.failed("https://example.test/admin/pos");
        assertEquals(2000, state.nextDelay());
    }

    @Test public void nonRetryableFailureCancelsPreviousTarget() {
        RecoveryState state = new RecoveryState();
        state.foreground = true;
        state.failed("https://example.test/admin");
        state.failed(null);
        assertFalse(state.canRetry(true));
    }
}
