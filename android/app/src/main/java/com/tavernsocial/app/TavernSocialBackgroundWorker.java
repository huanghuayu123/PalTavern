package com.tavernsocial.app;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class TavernSocialBackgroundWorker extends Worker {
    public TavernSocialBackgroundWorker(
        @NonNull Context context,
        @NonNull WorkerParameters parameters
    ) {
        super(context, parameters);
    }

    @NonNull
    @Override
    public Result doWork() {
        // If Android recreated only the process and no WebView is alive, skip safely.
        MainActivity.dispatchBackgroundCheck();
        return Result.success();
    }
}
