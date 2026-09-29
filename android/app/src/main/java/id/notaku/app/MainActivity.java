package id.notaku.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        // WebView tampak lebih rapat daripada Chrome pada sebagian perangkat.
        // Besarkan teks saja tanpa mengubah layout, nota, atau sumber CSS bersama.
        getBridge().getWebView().getSettings().setTextZoom(110);
    }
}
