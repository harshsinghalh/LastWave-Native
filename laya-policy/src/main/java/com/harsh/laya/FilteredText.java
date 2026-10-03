package com.harsh.laya;

import android.view.View;
import android.widget.TextView;

/** Recycled-row-safe comment masking. Local checks paint immediately; remote checks never block layout. */
public final class FilteredText {
    public static void bind(TextView view,String id,CharSequence original,String creator,String kind) {
        Object binding=new Object();
        view.setTag(R.id.laya_binding,binding);
        view.setOnClickListener(null);
        LayaClient client=LayaClient.get(view.getContext());
        java.util.function.Consumer<LayaClient.Decision> render=decision-> {
            if(view.getTag(R.id.laya_binding)!=binding) return;
            if(decision.hidden) {
                view.setVisibility(View.VISIBLE);
                view.setText(decision.engine.equals("pending")?decision.reason:"Hidden: "+decision.reason+" • Tap to reveal");
                view.setContentDescription("Hidden. "+decision.reason+". Tap to reveal once.");
                if(!decision.engine.equals("pending")) view.setOnClickListener(v->{ client.reveal(id);view.setText(original);view.setContentDescription(null);view.setOnClickListener(null); });
            } else { view.setText(original);view.setContentDescription(null);view.setOnClickListener(null); }
        };
        render.accept(client.initial(id,original==null?"":original.toString(),creator,kind));
        client.evaluate(id,original==null?"":original.toString(),creator,kind,render::accept);
    }
}
