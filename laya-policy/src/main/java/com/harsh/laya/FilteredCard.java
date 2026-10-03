package com.harsh.laya;

import android.view.View;
import android.widget.TextView;

/** Masks a native recommendation's artwork and title; revealing never starts hidden playback. */
public final class FilteredCard {
    public static void bind(View row,View artwork,TextView title,String id,String text,String creator) {
        Object binding=new Object();
        row.setTag(R.id.laya_binding,binding);
        artwork.setAlpha(1f);
        title.setOnClickListener(null);
        LayaClient client=LayaClient.get(row.getContext());
        java.util.function.Consumer<LayaClient.Decision> render=decision-> {
            if(row.getTag(R.id.laya_binding)!=binding) return;
            if(decision.hidden) {
                artwork.setAlpha(0f);
                row.setEnabled(false);
                row.setContentDescription("Hidden recommendation: "+decision.reason);
                title.setText(decision.engine.equals("pending")?decision.reason:"Hidden: "+decision.reason+" • Tap to reveal");
                title.setEnabled(true);
                if(!decision.engine.equals("pending")) title.setOnClickListener(v->{client.reveal(id);artwork.setAlpha(1f);row.setEnabled(true);row.setContentDescription(null);title.setText(text);title.setOnClickListener(null);});
            } else { artwork.setAlpha(1f);row.setEnabled(true);row.setContentDescription(null);title.setText(text);title.setOnClickListener(null); }
        };
        render.accept(client.initial(id,text,creator,"video"));
        client.evaluate(id,text,creator,"video",render::accept);
    }
}
