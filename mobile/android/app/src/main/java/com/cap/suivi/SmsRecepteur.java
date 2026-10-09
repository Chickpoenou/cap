package com.cap.suivi;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Reçoit chaque SMS entrant, même application fermée. Seuls les SMS
 * Mobile Money sont gardés (voir FileSms.estMobileMoney) ; les autres
 * sont ignorés sans être stockés.
 */
public class SmsRecepteur extends BroadcastReceiver {

    @Override
    public void onReceive(Context contexte, Intent intention) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intention.getAction())) return;
        SmsMessage[] morceaux = Telephony.Sms.Intents.getMessagesFromIntent(intention);
        if (morceaux == null || morceaux.length == 0) return;

        /* Un long SMS arrive en plusieurs morceaux : on les recolle par expéditeur. */
        Map<String, StringBuilder> parExpediteur = new LinkedHashMap<>();
        long recuLe = System.currentTimeMillis();
        for (SmsMessage morceau : morceaux) {
            if (morceau == null) continue;
            String expediteur = morceau.getDisplayOriginatingAddress() == null ? "" : morceau.getDisplayOriginatingAddress();
            StringBuilder texte = parExpediteur.get(expediteur);
            if (texte == null) {
                texte = new StringBuilder();
                parExpediteur.put(expediteur, texte);
            }
            texte.append(morceau.getDisplayMessageBody());
            recuLe = morceau.getTimestampMillis();
        }

        for (Map.Entry<String, StringBuilder> entree : parExpediteur.entrySet()) {
            String texte = entree.getValue().toString();
            if (!FileSms.estMobileMoney(texte)) continue;
            FileSms.ajouter(contexte, entree.getKey(), texte, recuLe);
            NotificationsCap.annoncer(contexte, texte);
        }
    }
}
