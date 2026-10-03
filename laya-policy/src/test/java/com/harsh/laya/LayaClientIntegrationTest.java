package com.harsh.laya;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.BooleanSupplier;
import okhttp3.OkHttpClient;
import okhttp3.mockwebserver.*;
import okhttp3.tls.HandshakeCertificates;
import okhttp3.tls.HeldCertificate;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.shadows.ShadowLooper.idleMainLooper;

/** Real HTTPS requests and Android preferences; the fixture is not a Laya accuracy benchmark. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=33, manifest=Config.NONE)
public class LayaClientIntegrationTest {
    private MockWebServer server;
    private PolicyStore store;
    private LayaClient client;
    private ThreadPoolExecutor queue;

    @Before public void setUp() throws Exception {
        store=new PolicyStore(RuntimeEnvironment.getApplication());
        store.preferences().edit().clear().commit();
        HeldCertificate certificate=new HeldCertificate.Builder().addSubjectAlternativeName("localhost").build();
        HandshakeCertificates serverTls=new HandshakeCertificates.Builder().heldCertificate(certificate).build();
        HandshakeCertificates clientTls=new HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate()).build();
        server=new MockWebServer();
        server.useHttps(serverTls.sslSocketFactory(),false);
        server.start();
        store.setEndpoint(server.url("/").toString());
        OkHttpClient http=new OkHttpClient.Builder().sslSocketFactory(clientTls.sslSocketFactory(),clientTls.trustManager())
                .callTimeout(5,TimeUnit.SECONDS).build();
        queue=new ThreadPoolExecutor(1,1,30,TimeUnit.SECONDS,new ArrayBlockingQueue<>(96));
        client=new LayaClient(store,http,queue);
    }
    @After public void tearDown() throws Exception {
        if(client!=null) client.close();
        if(queue!=null) assertTrue("HTTP worker did not stop",queue.awaitTermination(5,TimeUnit.SECONDS));
        if(server!=null) server.shutdown();
        idleMainLooper();
    }
    private static MockResponse json(String body) { return new MockResponse().setHeader("Content-Type","application/json").setBody(body); }
    private static MockResponse decision(String id, boolean hidden) {
        return json("{\"decisions\":[{\"id\":\""+id+"\",\"hidden\":"+hidden+",\"reason\":\"Fixture decision\",\"engine\":\"laya\"}]}");
    }
    private void until(BooleanSupplier condition) throws Exception {
        long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
        do {
            idleMainLooper();
            if(condition.getAsBoolean()) return;
            Thread.sleep(10);
        } while(System.nanoTime()<end);
        fail("Timed out waiting for HTTP completion");
    }
    private LayaClient.Decision evaluate(String id) throws Exception {
        AtomicReference<LayaClient.Decision> result=new AtomicReference<>();
        client.evaluate(id,"Ordinary science video","Someone","video",result::set);
        until(()->result.get()!=null);
        return result.get();
    }
    @Test public void readinessWithoutConsentSendsNoMetadataAndEvaluationStaysLocal() throws Exception {
        assertEquals("local rules",evaluate("video:local").engine);
        assertEquals(0,server.getRequestCount());
        server.enqueue(json("{\"ready\":true,\"engine\":\"laya\",\"models\":[\"english\",\"multilingual\"]}"));
        client.checkConnection();
        RecordedRequest request=server.takeRequest(5,TimeUnit.SECONDS);
        assertNotNull(request);
        assertEquals("GET",request.getMethod());
        assertEquals("/healthz",request.getPath());
        assertEquals(0,request.getBodySize());
        assertFalse(store.consent());
    }
    @Test public void httpsEvaluationUsesSavedPolicyAndCachesTheMatchingItem() throws Exception {
        store.setConsent(true);
        store.save(store.snapshot().put("spam",true));
        server.enqueue(decision("video:one",true));
        assertEquals("pending",client.initial("video:one","Ordinary science video","Someone","video").engine);
        assertTrue(evaluate("video:one").hidden);
        RecordedRequest request=server.takeRequest(5,TimeUnit.SECONDS);
        assertNotNull(request);
        assertEquals("/v1/evaluate",request.getPath());
        JSONObject body=new JSONObject(request.getBody().readUtf8());
        assertTrue(body.getJSONObject("policy").getBoolean("spam"));
        assertEquals("video:one",body.getJSONArray("items").getJSONObject(0).getString("id"));
        assertTrue(evaluate("video:one").hidden);
        assertEquals(1,server.getRequestCount());
    }
    @Test public void redirectedMetadataIsNotSentToAnotherPath() throws Exception {
        store.setConsent(true);
        server.enqueue(new MockResponse().setResponseCode(307).setHeader("Location",server.url("/redirect-target")));
        LayaClient.Decision result=evaluate("video:redirect");
        assertFalse(result.hidden);
        assertEquals("local rules",result.engine);
        assertEquals(1,server.getRequestCount());
    }
    @Test public void anotherItemsDecisionCannotHideThisItem() throws Exception {
        store.setConsent(true);
        server.enqueue(decision("video:different",true));
        LayaClient.Decision result=evaluate("video:expected");
        assertFalse(result.hidden);
        assertEquals("local rules",result.engine);
        assertTrue(store.status().contains("unavailable"));
    }
    @Test public void preferenceChangeCancelsTheActiveCallAndDropsObsoleteQueuedChecks() throws Exception {
        store.setConsent(true);
        ConcurrentLinkedQueue<String> received=new ConcurrentLinkedQueue<>();
        server.setDispatcher(new Dispatcher() {
            @Override public MockResponse dispatch(RecordedRequest request) {
                try {
                    String id=new JSONObject(request.getBody().readUtf8()).getJSONArray("items").getJSONObject(0).getString("id");
                    received.add(id);
                    return id.equals("video:old")?new MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE):decision(id,false);
                } catch(Exception invalid) { throw new AssertionError(invalid); }
            }
        });
        AtomicInteger obsoleteCallbacks=new AtomicInteger();
        client.evaluate("video:old","ordinary text","Someone","video",r->obsoleteCallbacks.incrementAndGet());
        assertNotNull(server.takeRequest(5,TimeUnit.SECONDS));
        client.evaluate("video:queued-1","ordinary text","Someone","video",r->obsoleteCallbacks.incrementAndGet());
        client.evaluate("video:queued-2","ordinary text","Someone","video",r->obsoleteCallbacks.incrementAndGet());
        store.save(store.snapshot().put("spam",true));
        assertEquals("laya",evaluate("video:new").engine);
        until(()->queue.getActiveCount()==0);
        assertEquals(0,obsoleteCallbacks.get());
        assertEquals(Arrays.asList("video:old","video:new"),new ArrayList<>(received));
    }
    @Test public void revokingConsentCancelsActiveWorkAndPreventsQueuedMetadata() throws Exception {
        store.setConsent(true);
        server.enqueue(new MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE));
        AtomicInteger obsoleteCallbacks=new AtomicInteger();
        client.evaluate("video:old","ordinary text","Someone","video",r->obsoleteCallbacks.incrementAndGet());
        assertNotNull(server.takeRequest(5,TimeUnit.SECONDS));
        client.evaluate("video:queued","ordinary text","Someone","video",r->obsoleteCallbacks.incrementAndGet());
        store.setConsent(false);
        assertEquals("local rules",evaluate("video:new").engine);
        until(()->queue.getActiveCount()==0);
        assertEquals(0,obsoleteCallbacks.get());
        assertEquals(1,server.getRequestCount());
    }
    @Test public void delayedPreferenceNotificationKeepsChecksForTheNewState() throws Exception {
        store.setConsent(true);
        JSONObject changed=store.snapshot().put("spam",true);
        Thread edit=new Thread(()->store.save(changed));
        edit.start();
        edit.join(5000);
        assertFalse(edit.isAlive());
        // The change is persisted, but its main-thread preference listeners have not run yet.
        server.enqueue(decision("video:latest",false));
        AtomicReference<LayaClient.Decision> result=new AtomicReference<>();
        client.evaluate("video:latest","ordinary text","Someone","video",result::set);
        until(()->result.get()!=null);
        assertEquals("laya",result.get().engine);
        RecordedRequest request=server.takeRequest(5,TimeUnit.SECONDS);
        assertNotNull(request);
        assertTrue(new JSONObject(request.getBody().readUtf8()).getJSONObject("policy").getBoolean("spam"));
    }
    @Test public void completedPromptCannotReplaceNewerEdits() throws Exception {
        store.setConsent(true);
        PolicyStore.RequestState submitted=store.requestState();
        JSONObject suggested=submitted.policy().put("topics",new JSONArray().put("Science"));
        server.enqueue(json(new JSONObject().put("policy",suggested).put("engine","laya").toString()));
        JSONObject response=client.compilePrompt("Only science please",submitted);
        store.save(store.snapshot().put("spam",true));
        assertFalse(store.saveIfUnchanged(response.getJSONObject("policy"),submitted));
        assertTrue(store.snapshot().getBoolean("spam"));
        assertEquals(0,store.snapshot().getJSONArray("topics").length());
        RecordedRequest request=server.takeRequest(5,TimeUnit.SECONDS);
        assertNotNull(request);
        assertEquals("/v1/policy/compile",request.getPath());
        assertEquals("Only science please",new JSONObject(request.getBody().readUtf8()).getString("prompt"));
    }
    @Test public void unchangedPromptSavesAndChangedConsentRejectsIt() throws Exception {
        PolicyStore.RequestState current=store.requestState();
        assertTrue(store.saveIfUnchanged(current.policy().put("spam",true),current));
        PolicyStore.RequestState next=store.requestState();
        store.setConsent(true);
        assertFalse(store.saveIfUnchanged(next.policy().put("spam",false),next));
        assertTrue(store.snapshot().getBoolean("spam"));
    }
    @Test public void corruptStoredJsonRestoresCompleteDefaults() throws Exception {
        store.preferences().edit().putString("policy","not json").commit();
        assertTrue(store.snapshot().getBoolean("enabled"));
        assertTrue(store.snapshot().getBoolean("abuse"));
        assertEquals(0,store.snapshot().getJSONArray("topics").length());
    }
    @Test public void expiredEvidenceIsNotReusedByTheAndroidCache() throws Exception {
        store.setConsent(true);
        AtomicLong expiry=new AtomicLong();
        AtomicInteger calls=new AtomicInteger();
        server.setDispatcher(new Dispatcher() {
            @Override public MockResponse dispatch(RecordedRequest request) {
                if(calls.incrementAndGet()>1) return decision("video:evidence",false);
                expiry.set(System.currentTimeMillis()+1500);
                return json("{\"decisions\":[{\"id\":\"video:evidence\",\"hidden\":true,\"reason\":\"Fixture evidence\",\"engine\":\"evidence\",\"expires\":"+expiry.get()/1000.0+"}]}");
            }
        });
        assertTrue(evaluate("video:evidence").hidden);
        until(()->System.currentTimeMillis()>=expiry.get());
        assertEquals("pending",client.initial("video:evidence","Ordinary science video","Someone","video").engine);
        assertFalse(evaluate("video:evidence").hidden);
        assertEquals(2,server.getRequestCount());
    }
}
