package com.smartinvoicepro.app;

import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import java.util.HashMap;
import java.util.Map;

/**
 * Overrides the Capacitor WebViewClient to inject Cross-Origin-Opener-Policy
 * and Cross-Origin-Embedder-Policy headers on every local asset response.
 *
 * These headers mark the page as "cross-origin isolated", which enables
 * SharedArrayBuffer in the WebView. SharedArrayBuffer is required by the
 * ort-wasm-simd-threaded.wasm ONNX Runtime binary used by Transformers.js.
 * Without it, session creation fails with std::bad_alloc even on high-RAM
 * devices (e.g. Pixel 10 Pro).
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getBridge().getWebView().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse response = super.shouldInterceptRequest(view, request);
                if (response == null) return null;

                Map<String, String> headers = response.getResponseHeaders();
                Map<String, String> newHeaders = headers != null
                        ? new HashMap<>(headers)
                        : new HashMap<>();

                newHeaders.put("Cross-Origin-Opener-Policy", "same-origin");
                newHeaders.put("Cross-Origin-Embedder-Policy", "require-corp");
                response.setResponseHeaders(newHeaders);

                return response;
            }
        });
    }
}
