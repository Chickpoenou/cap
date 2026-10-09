package com.cap.suivi;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        /* Le pont CapSms doit être enregistré avant le démarrage de la page. */
        registerPlugin(CapSmsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
