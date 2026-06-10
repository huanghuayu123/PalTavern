package com.tavernsocial.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
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
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(
    name = "TavernSocialBackground",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class TavernSocialBackgroundPlugin extends Plugin {
    private static final String WORK_NAME = "tavern-social-proactive-message-check";
    private static final String CHANNEL_ID = "tavern-social-messages";
    private static final String BACKUP_FOLDER = "TavernSocial";

    @PluginMethod
    public void requestSchedule(PluginCall call) {
        Long nextAttemptAt = call.getLong("nextAttemptAt");
        Integer enabledCharacters = call.getInt("enabledCharacters", 0);
        WorkManager manager = WorkManager.getInstance(getContext());
        if (enabledCharacters == null || enabledCharacters <= 0 || nextAttemptAt == null) {
            manager.cancelUniqueWork(WORK_NAME);
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("cancelled", true);
            call.resolve(result);
            return;
        }

        long delay = Math.max(0L, nextAttemptAt - System.currentTimeMillis());
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(TavernSocialBackgroundWorker.class)
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setConstraints(constraints)
            .build();
        manager.enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request);

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("scheduledAt", nextAttemptAt);
        call.resolve(result);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || getPermissionState("notifications") == PermissionState.GRANTED) {
            resolveNotificationPermission(call);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        resolveNotificationPermission(call);
    }

    private void resolveNotificationPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void notifyMessage(PluginCall call) {
        String title = call.getString("title", "Tavern Social");
        String body = call.getString("body", "有新消息。");
        if (!canNotify()) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("reason", "notification_permission");
            call.resolve(result);
            return;
        }
        createNotificationChannel();
        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true);
        NotificationManagerCompat.from(getContext())
            .notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    @PluginMethod
    public void saveBackup(PluginCall call) {
        String fileName = call.getString("fileName", "");
        String content = call.getString("content", "");
        if (fileName == null || fileName.trim().isEmpty() || content == null || content.isEmpty()) {
            call.reject("缺少备份文件名或内容。");
            return;
        }
        try {
            JSObject result = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? saveBackupWithMediaStore(fileName, content)
                : saveBackupWithPublicDownloads(fileName, content);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("备份保存失败：" + error.getMessage(), error);
        }
    }

    private JSObject saveBackupWithMediaStore(String fileName, String content) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
        values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + BACKUP_FOLDER);
        values.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new IllegalStateException("无法创建下载文件。");
        }
        try (OutputStream output = resolver.openOutputStream(uri)) {
            if (output == null) throw new IllegalStateException("无法打开备份文件。");
            output.write(content.getBytes(StandardCharsets.UTF_8));
        }
        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        return backupResult(fileName, Environment.DIRECTORY_DOWNLOADS + "/" + BACKUP_FOLDER, uri.toString());
    }

    private JSObject saveBackupWithPublicDownloads(String fileName, String content) throws Exception {
        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        File folder = new File(downloads, BACKUP_FOLDER);
        if (!folder.exists() && !folder.mkdirs()) {
            throw new IllegalStateException("无法创建备份目录。");
        }
        File file = new File(folder, fileName);
        try (OutputStream output = new FileOutputStream(file)) {
            output.write(content.getBytes(StandardCharsets.UTF_8));
        }
        return backupResult(fileName, file.getParent(), Uri.fromFile(file).toString());
    }

    private JSObject backupResult(String fileName, String folderPath, String uri) {
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("fileName", fileName);
        result.put("folderPath", folderPath);
        result.put("uri", uri);
        return result;
    }

    private boolean canNotify() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = (NotificationManager) getContext()
            .getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "角色消息",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("角色主动消息和聊天提醒");
        manager.createNotificationChannel(channel);
    }
}
