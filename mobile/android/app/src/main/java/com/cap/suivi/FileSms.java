package com.cap.suivi;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSArray;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * File d'attente des SMS Mobile Money reçus, gardée dans le stockage privé
 * de l'application jusqu'à ce que l'utilisateur les vérifie dans Cap.
 * Rien n'est envoyé sur Internet.
 */
public final class FileSms {

    private static final String PREFERENCES = "cap_sms";
    private static final String CLE = "file";
    private static final int MAXIMUM = 100;

    /* Caractères invisibles que les opérateurs glissent dans les SMS. */
    private static final Pattern INVISIBLES = Pattern.compile("[\\x{FEFF}\\x{200B}\\x{200C}\\x{200D}]");
    /* Un montant : « 10 000 FCFA », « 100F », « 500 XOF ». */
    private static final Pattern MONTANT = Pattern.compile("\\d[\\d .]*\\s*(FCFA|F\\s?CFA|XOF|F\\b)", Pattern.CASE_INSENSITIVE);
    /* Une opération d'argent (Moov Money, MTN MoMo). */
    private static final Pattern OPERATION = Pattern.compile(
            "pay[ée]|paiement|transf[ée]r|transfert|envoy[ée]|re[çc]u|retir[ée]|retrait|d[ée]p[ôo]t|recharg[ée]|activ[ée].{0,40}forfait|forfait.{0,40}via moov",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    /* Messages sans dépense réelle : informations de forfait, demandes, crédit offert. */
    private static final Pattern SANS_DEPENSE = Pattern.compile(
            "expir|vous venez de consommer|vous donnant droit|demande de paiement|re[çc]u\\s+\\d[\\d .]*\\s*(FCFA|F)\\s+de cr[ée]dit",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    private FileSms() {
    }

    static String nettoyer(String texte) {
        return INVISIBLES.matcher(texte).replaceAll("").replace((char) 0x00A0, ' ').replace((char) 0x202F, ' ');
    }

    public static boolean estMobileMoney(String texte) {
        if (texte == null) return false;
        String propre = nettoyer(texte);
        return MONTANT.matcher(propre).find() && OPERATION.matcher(propre).find() && !SANS_DEPENSE.matcher(propre).find();
    }

    public static synchronized void ajouter(Context contexte, String expediteur, String texte, long recuLe) {
        JSONArray file = lireFile(contexte);
        try {
            JSONObject message = new JSONObject();
            message.put("id", UUID.randomUUID().toString());
            message.put("expediteur", expediteur);
            message.put("texte", texte);
            message.put("recuLe", recuLe);
            file.put(message);
            while (file.length() > MAXIMUM) file.remove(0);
        } catch (JSONException erreur) {
            return;
        }
        ecrireFile(contexte, file);
    }

    public static synchronized JSArray lire(Context contexte) {
        JSArray resultat = new JSArray();
        JSONArray file = lireFile(contexte);
        for (int i = 0; i < file.length(); i++) {
            JSONObject message = file.optJSONObject(i);
            if (message != null) resultat.put(message);
        }
        return resultat;
    }

    public static synchronized int nombre(Context contexte) {
        return lireFile(contexte).length();
    }

    public static synchronized void retirer(Context contexte, Set<String> ids) {
        JSONArray file = lireFile(contexte);
        JSONArray restants = new JSONArray();
        for (int i = 0; i < file.length(); i++) {
            JSONObject message = file.optJSONObject(i);
            if (message != null && !ids.contains(message.optString("id"))) restants.put(message);
        }
        ecrireFile(contexte, restants);
    }

    private static JSONArray lireFile(Context contexte) {
        SharedPreferences preferences = contexte.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        try {
            return new JSONArray(preferences.getString(CLE, "[]"));
        } catch (JSONException erreur) {
            return new JSONArray();
        }
    }

    private static void ecrireFile(Context contexte, JSONArray file) {
        contexte.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putString(CLE, file.toString()).apply();
    }
}
