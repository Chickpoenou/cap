package com.cap.suivi;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.util.HashSet;
import java.util.Set;

/** Pont entre la page web de Cap et la file des SMS reçus (window.Capacitor.Plugins.CapSms). */
@CapacitorPlugin(
        name = "CapSms",
        permissions = {
                @Permission(alias = "sms", strings = { Manifest.permission.RECEIVE_SMS }),
                @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
        }
)
public class CapSmsPlugin extends Plugin {

    /** SMS en attente de vérification. */
    @PluginMethod
    public void lire(PluginCall appel) {
        JSObject resultat = new JSObject();
        resultat.put("messages", FileSms.lire(getContext()));
        appel.resolve(resultat);
    }

    /** Retire les SMS traités (enregistrés ou ignorés) de la file. */
    @PluginMethod
    public void vider(PluginCall appel) {
        JSArray ids = appel.getArray("ids", new JSArray());
        Set<String> aRetirer = new HashSet<>();
        try {
            for (Object id : ids.toList()) aRetirer.add(String.valueOf(id));
        } catch (JSONException erreur) {
            appel.reject("Liste d'identifiants illisible.");
            return;
        }
        FileSms.retirer(getContext(), aRetirer);
        if (FileSms.nombre(getContext()) == 0) NotificationsCap.effacer(getContext());
        appel.resolve();
    }

    @PluginMethod
    public void etat(PluginCall appel) {
        JSObject resultat = new JSObject();
        resultat.put("sms", getPermissionState("sms") == PermissionState.GRANTED ? "granted" : "denied");
        boolean notifications = Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED;
        resultat.put("notifications", notifications ? "granted" : "denied");
        appel.resolve(resultat);
    }

    @PluginMethod
    public void demanderPermissions(PluginCall appel) {
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissionForAliases(new String[] { "sms", "notifications" }, appel, "apresPermissions");
        } else {
            requestPermissionForAlias("sms", appel, "apresPermissions");
        }
    }

    @PermissionCallback
    private void apresPermissions(PluginCall appel) {
        etat(appel);
    }
}
