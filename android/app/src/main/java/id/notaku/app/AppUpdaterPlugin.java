package id.notaku.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final long MAX_APK_BYTES = 150L * 1024L * 1024L;
    private File pendingApk;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url", "");
        String version = call.getString("version", "latest");
        if (!isTrustedGithubUrl(url)) {
            call.reject("Alamat APK tidak valid.");
            return;
        }

        new Thread(() -> {
            try {
                pendingApk = downloadApk(url, version);
                getActivity().runOnUiThread(() -> requestInstall(call));
            } catch (Exception error) {
                call.reject("Gagal mengunduh APK: " + error.getMessage(), error);
            }
        }, "notaku-apk-updater").start();
    }

    private boolean isTrustedGithubUrl(String value) {
        try {
            Uri uri = Uri.parse(value);
            String host = uri.getHost();
            return "https".equalsIgnoreCase(uri.getScheme()) && host != null && (
                host.equalsIgnoreCase("github.com") || host.toLowerCase(Locale.ROOT).endsWith(".githubusercontent.com")
            );
        } catch (Exception ignored) {
            return false;
        }
    }

    private File downloadApk(String source, String version) throws Exception {
        File updateDir = new File(getContext().getCacheDir(), "updates");
        if (!updateDir.exists() && !updateDir.mkdirs()) throw new Exception("Folder pembaruan tidak dapat dibuat");
        File destination = new File(updateDir, "NotaKu-" + version.replaceAll("[^0-9A-Za-z._-]", "") + ".apk");
        File temporary = new File(updateDir, destination.getName() + ".download");
        if (temporary.exists()) temporary.delete();

        HttpURLConnection connection = (HttpURLConnection) new URL(source).openConnection();
        connection.setConnectTimeout(20_000);
        connection.setReadTimeout(60_000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
        connection.setRequestProperty("User-Agent", "NotaKu-Android-Updater");
        connection.connect();

        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            connection.disconnect();
            throw new Exception("Server GitHub merespons HTTP " + status);
        }
        long expected = connection.getContentLengthLong();
        if (expected > MAX_APK_BYTES) {
            connection.disconnect();
            throw new Exception("Ukuran APK melebihi batas aman");
        }

        long total = 0;
        try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temporary)) {
            byte[] buffer = new byte[32 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_APK_BYTES) throw new Exception("Ukuran APK melebihi batas aman");
                output.write(buffer, 0, read);
            }
            output.getFD().sync();
        } finally {
            connection.disconnect();
        }
        if (total == 0 || (expected > 0 && total != expected)) {
            temporary.delete();
            throw new Exception("Unduhan APK tidak lengkap");
        }
        if (destination.exists() && !destination.delete()) throw new Exception("APK lama tidak dapat diganti");
        if (!temporary.renameTo(destination)) throw new Exception("APK tidak dapat disiapkan");
        return destination;
    }

    private void requestInstall(PluginCall call) {
        if (pendingApk == null || !pendingApk.exists()) {
            call.reject("Berkas pembaruan tidak ditemukan.");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent permissionIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            startActivityForResult(call, permissionIntent, "unknownSourcesResult");
            return;
        }
        launchInstaller(call);
    }

    @ActivityCallback
    private void unknownSourcesResult(PluginCall call, ActivityResult result) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls()) {
            launchInstaller(call);
        } else {
            call.reject("Izin instal aplikasi dari NotaKu belum diaktifkan.");
        }
    }

    private void launchInstaller(PluginCall call) {
        try {
            Uri apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                pendingApk
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(intent);
            JSObject result = new JSObject();
            result.put("installerOpened", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Pemasang Android tidak dapat dibuka: " + error.getMessage(), error);
        }
    }
}
