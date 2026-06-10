package com.tavernsocial.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import java.lang.ref.WeakReference;

public class MainActivity extends BridgeActivity {
    private static WeakReference<MainActivity> currentActivity = new WeakReference<>(null);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(TavernSocialBackgroundPlugin.class);
        super.onCreate(savedInstanceState);
        currentActivity = new WeakReference<>(this);
    }

    @Override
    public void onDestroy() {
        if (currentActivity.get() == this) {
            currentActivity.clear();
        }
        super.onDestroy();
    }

    public static boolean dispatchBackgroundCheck() {
        MainActivity activity = currentActivity.get();
        if (activity == null || activity.getBridge() == null || activity.getBridge().getWebView() == null) {
            return false;
        }
        activity.runOnUiThread(() ->
            activity.getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('tavern-social-background-check'));",
                null
            )
        );
        return true;
    }
}
