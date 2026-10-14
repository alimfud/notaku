package id.notaku.app;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String RELEASE_DOWNLOAD_TEMPLATE =
        "https://github.com/alimfud/notaku/releases/download/v%s/NotaKu-v%s.apk";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String version = call.getString("version");
        if (version == null || !version.matches("\\d+\\.\\d+\\.\\d+")) {
            call.reject("Versi pembaruan tidak valid.");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent permissionIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            getActivity().startActivity(permissionIntent);
            JSObject result = new JSObject();
            result.put("requiresPermission", true);
            call.resolve(result);
            return;
        }

        executor.execute(() -> {
            try {
                File apk = downloadApk(version);
                Uri apkUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apk
                );
                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                installIntent.setClipData(ClipData.newRawUri("NotaKu APK", apkUri));

                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().startActivity(installIntent);
                        JSObject result = new JSObject();
                        result.put("started", true);
                        result.put("version", version);
                        call.resolve(result);
                    } catch (Exception error) {
                        call.reject("Gagal membuka pemasang APK.", error);
                    }
                });
            } catch (Exception error) {
                getActivity().runOnUiThread(() -> call.reject(
                    error.getMessage() == null ? "Gagal mengunduh pembaruan APK." : error.getMessage(),
                    error
                ));
            }
        });
    }

    private File downloadApk(String version) throws IOException {
        String downloadUrl = String.format(RELEASE_DOWNLOAD_TEMPLATE, version, version);
        HttpURLConnection connection = (HttpURLConnection) new URL(downloadUrl).openConnection();
        connection.setInstanceFollowRedirects(true);
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(120000);
        connection.setRequestProperty("User-Agent", "NotaKu-Android-Updater");

        int responseCode = connection.getResponseCode();
        if (responseCode < 200 || responseCode >= 300) {
            connection.disconnect();
            throw new IOException("APK versi " + version + " belum tersedia (HTTP " + responseCode + ").");
        }

        File updateDir = new File(getContext().getCacheDir(), "apk-updates");
        if (!updateDir.exists() && !updateDir.mkdirs()) {
            connection.disconnect();
            throw new IOException("Folder pembaruan tidak dapat dibuat.");
        }
        File apkFile = new File(updateDir, "NotaKu-v" + version + ".apk");
        try (
            InputStream input = new BufferedInputStream(connection.getInputStream());
            BufferedOutputStream output = new BufferedOutputStream(new FileOutputStream(apkFile))
        ) {
            byte[] buffer = new byte[8192];
            int count;
            long total = 0;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
                total += count;
            }
            if (total == 0) throw new IOException("File APK kosong.");
        } finally {
            connection.disconnect();
        }
        return apkFile;
    }
}
