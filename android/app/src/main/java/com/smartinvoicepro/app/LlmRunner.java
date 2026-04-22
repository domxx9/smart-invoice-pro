package com.smartinvoicepro.app;

import android.util.Log;

import org.pytorch.executorch.extension.llm.LlmCallback;
import org.pytorch.executorch.extension.llm.LlmModule;

public class LlmRunner {
    private static final String TAG = "LlmRunner";

    public interface TokenCallback {
        void onToken(String token);
        void onDone(String fullText);
        void onError(String message);
    }

    private LlmModule mModule;
    private volatile boolean mGenerating = false;

    public synchronized void load(String modelPath, String tokenizerPath, float temperature)
            throws Exception {
        if (mModule != null) {
            unload();
        }
        Log.i(TAG, "Loading model: " + modelPath);
        mModule = new LlmModule(modelPath, tokenizerPath, temperature);
        mModule.load();
        Log.i(TAG, "Model loaded OK");
    }

    public boolean isLoaded() {
        return mModule != null;
    }

    public void generate(String prompt, int maxTokens, TokenCallback cb) {
        if (mModule == null) {
            cb.onError("Model not loaded");
            return;
        }
        if (mGenerating) {
            cb.onError("Inference already in progress");
            return;
        }
        mGenerating = true;
        final StringBuilder sb = new StringBuilder();

        try {
            mModule.generate(prompt, maxTokens, new LlmCallback() {
                @Override
                public void onResult(String token) {
                    sb.append(token);
                    cb.onToken(token);
                }

                @Override
                public void onStats(String stats) {
                    Log.d(TAG, "Stats: " + stats);
                }

                @Override
                public void onError(int code, String message) {
                    Log.e(TAG, "Inference error: " + message);
                    cb.onError(message);
                }
            });
            cb.onDone(sb.toString());
        } catch (Exception e) {
            Log.e(TAG, "generate error", e);
            cb.onError(e.getMessage() != null ? e.getMessage() : "Inference failed");
        } finally {
            mGenerating = false;
        }
    }

    public void stop() {
        LlmModule mod = mModule;
        if (mod != null && mGenerating) {
            try {
                mod.stop();
            } catch (Exception e) {
                Log.w(TAG, "stop error (ignored)", e);
            }
        }
    }

    public synchronized void unload() {
        if (mModule != null) {
            try {
                mModule.stop();
            } catch (Exception ignored) {}
            try {
                mModule.close();
            } catch (Exception ignored) {}
            mModule = null;
            Log.i(TAG, "Model unloaded");
        }
    }
}
