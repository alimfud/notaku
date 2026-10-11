package id.notaku.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { NotaKuNativeShell() }
    }
}

@Composable
private fun NotaKuNativeShell() {
    MaterialTheme {
        Surface { Text("NotaKu\nNative Android", modifier = Modifier) }
    }
}

@Preview
@Composable
private fun PreviewNotaKu() = NotaKuNativeShell()
