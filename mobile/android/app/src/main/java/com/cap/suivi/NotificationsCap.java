package com.cap.suivi;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Notification « transaction détectée » ; la toucher ouvre Cap sur l'écran de vérification. */
public final class NotificationsCap {

    private static final String CANAL = "transactions";
    private static final int IDENTIFIANT = 1;
    private static final Pattern MONTANT = Pattern.compile("(\\d{1,3}(?:[ .]\\d{3})+|\\d+)\\s*(?:FCFA|F\\s?CFA|XOF|F\\b)", Pattern.CASE_INSENSITIVE);

    private NotificationsCap() {
    }

    public static void annoncer(Context contexte, String texte) {
        if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(contexte, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        creerCanal(contexte);

        int nombre = FileSms.nombre(contexte);
        String titre = nombre > 1 ? nombre + " transactions Mobile Money à vérifier" : "Transaction Mobile Money détectée";
        Matcher montant = MONTANT.matcher(FileSms.nettoyer(texte));
        String detail = (montant.find() ? montant.group(1).replace('.', ' ') + " F · " : "") + "Touche pour vérifier et enregistrer";

        Intent ouverture = new Intent(contexte, MainActivity.class);
        ouverture.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent action = PendingIntent.getActivity(contexte, 0, ouverture,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder notification = new NotificationCompat.Builder(contexte, CANAL)
                .setSmallIcon(R.drawable.ic_stat_cap)
                .setColor(0xFF5B47D1)
                .setContentTitle(titre)
                .setContentText(detail)
                .setContentIntent(action)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setCategory(NotificationCompat.CATEGORY_REMINDER);
        try {
            NotificationManagerCompat.from(contexte).notify(IDENTIFIANT, notification.build());
        } catch (SecurityException refus) {
            /* Permission retirée entre-temps : le SMS reste dans la file. */
        }
    }

    public static void effacer(Context contexte) {
        NotificationManagerCompat.from(contexte).cancel(IDENTIFIANT);
    }

    private static void creerCanal(Context contexte) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel canal = new NotificationChannel(CANAL, "Transactions détectées", NotificationManager.IMPORTANCE_DEFAULT);
        canal.setDescription("Prévient quand un SMS Mobile Money peut être enregistré dans Cap.");
        contexte.getSystemService(NotificationManager.class).createNotificationChannel(canal);
    }
}
