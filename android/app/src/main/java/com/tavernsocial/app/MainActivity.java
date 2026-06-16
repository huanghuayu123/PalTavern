package com.tavernsocial.app;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import java.lang.ref.WeakReference;

public class MainActivity extends BridgeActivity {
    private static WeakReference<MainActivity> currentActivity = new WeakReference<>(null);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(TavernSocialBackgroundPlugin.class);
        super.onCreate(savedInstanceState);
        currentActivity = new WeakReference<>(this);
        installInAppBackDispatcher();
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

    private void installInAppBackDispatcher() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                dispatchInAppBackOrDefault(this);
            }
        });
    }

    private void dispatchInAppBackOrDefault(OnBackPressedCallback callback) {
        if (getBridge() == null || getBridge().getWebView() == null) {
            runDefaultBack(callback);
            return;
        }
        String script = "(function(){"
            + "var event=new CustomEvent('tavern-social-android-back',{cancelable:true});"
            + "window.dispatchEvent(event);"
            + "return event.defaultPrevented===true;"
            + "})()";
        getBridge().getWebView().evaluateJavascript(script, handled -> {
            if (!"true".equals(handled)) {
                runDefaultBack(callback);
            }
        });
    }

    private void runDefaultBack(OnBackPressedCallback callback) {
        callback.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        callback.setEnabled(true);
    }
}
