package com.app4clients.allinonebilltracker;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        try {
            Class<?> clazz = Class.forName("com.app4clients.allinonebilltracker.AmazonIapPlugin");
            if (Plugin.class.isAssignableFrom(clazz)) {
                @SuppressWarnings("unchecked")
                Class<? extends Plugin> pluginClass = (Class<? extends Plugin>) clazz;
                registerPlugin(pluginClass);
            }
        } catch (Exception e) {
            Log.d(TAG, "AmazonIapPlugin not registered (non-amazon flavor or missing class).");
        }

        super.onCreate(savedInstanceState);
    }
}