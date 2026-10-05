package in.aggarwaljeweller.counter;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugin: Bluetooth label printing + Android print screen (see AjPrinterPlugin).
        registerPlugin(AjPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
