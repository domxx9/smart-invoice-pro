package com.smartinvoicepro.app;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;

import org.pytorch.executorch.extension.llm.LlmCallback;
import org.pytorch.executorch.extension.llm.LlmModule;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "LlmRunner")
public class ExecutorchPlugin extends Plugin {
    private static final String TAG = "ExecutorchPlugin";
    private static final String EVENT_TOKEN = "executorch:token";

    private ExecutorService mExecutor = Executors.newSingleThreadExecutor();
    private LlmModule mModule;
    private final AtomicBoolean mGenerating = new AtomicBoolean(false);

    @PluginMethod
    public void loadModel(PluginCall call) {
        String modelPath = call.getString("modelPath");
        String tokenizerPath = call.getString("tokenizerPath");
        float temperature = (float) call.getDouble("temperature", 0.7f);

        if (modelPath == null || tokenizerPath == null) {
            call.reject("modelPath and tokenizerPath are required");
            return;
        }

        mExecutor.execute(() -> {
            try {
                if (mModule != null) {
                    mModule.close();
                }
                mModule = new LlmModule(modelPath, tokenizerPath, temperature);
                mModule.load();
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "loadModel error", e);
                call.reject("Failed to load model: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void infer(PluginCall call) {
        String prompt = call.getString("prompt");
        int maxTokens = call.getInt("maxTokens", 256);

        if (prompt == null) {
            call.reject("prompt is required");
            return;
        }

        if (mModule == null) {
            call.reject("Model not loaded. Call loadModel first.");
            return;
        }

        if (!mGenerating.compareAndSet(false, true)) {
            call.reject("Inference already in progress");
            return;
        }

        mExecutor.execute(() -> {
            StringBuilder fullText = new StringBuilder();
            try {
                mModule.generate(prompt, maxTokens, new LlmCallback() {
                    @Override
                    public void onResult(String token) {
                        fullText.append(token);
                        JSObject data = new JSObject();
                        data.put("token", token);
                        notifyListeners(EVENT_TOKEN, data);
                    }

                    @Override
                    public void onStats(String stats) {
                        Log.d(TAG, "Stats: " + stats);
                    }

                    @Override
                    public void onError(int code, String message) {
                        Log.e(TAG, "Inference error: " + message);
                    }
                });
                JSObject result = new JSObject();
                result.put("text", fullText.toString());
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "infer error", e);
                call.reject("Inference failed: " + e.getMessage());
            } finally {
                mGenerating.set(false);
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        if (mModule != null && mGenerating.get()) {
            try {
                mModule.stop();
            } catch (Exception e) {
                Log.w(TAG, "stop error", e);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void unloadModel(PluginCall call) {
        mExecutor.execute(() -> {
            if (mModule != null) {
                try {
                    mModule.stop();
                } catch (Exception ignored) {}
                try {
                    mModule.close();
                } catch (Exception ignored) {}
                mModule = null;
            }
            call.resolve();
        });
    }

    @Override
    protected void handleDestroy() {
        mExecutor.shutdown();
        if (mModule != null) {
            try {
                mModule.stop();
            } catch (Exception ignored) {}
            try {
                mModule.close();
            } catch (Exception ignored) {}
            mModule = null;
        }
        super.handleDestroy();
    }
}
