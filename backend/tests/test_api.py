"""HTTP contract tests use a named test double; these do not validate real model accuracy."""
import httpx
import pytest
import asyncio
import service

class ExplicitTestDouble:
    def predict(self,state,questions):
        return {"answers":{k:{"noul":0,"confidence":.99,"choice":"unchanged"} for k in questions}}

def call(method,path,body=None):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=service.app),base_url="https://test") as client:
            return await client.request(method,path,json=body)
    return asyncio.run(run())

def test_no_model_is_not_reported_ready():
    service.app.state.router=None
    assert call('GET','/healthz').status_code==503
    r=call('POST','/v1/evaluate',{'policy':{},'items':[{'id':'1','text':'ordinary text'}]})
    assert r.status_code==503

def test_endpoint_and_validation_contract():
    service.app.state.router=ExplicitTestDouble()
    r=call('POST','/v1/evaluate',{'policy':{},'items':[{'id':'1','text':'f*ck'}]})
    assert r.status_code==200 and r.json()['decisions'][0]['engine']=='local rules'
    assert call('POST','/v1/evaluate',{'policy':{},'items':[]}).status_code==422
    assert call('POST','/v1/evaluate',{'policy':{'topics':['invented']},'items':[{'id':'1','text':'hello'}]}).status_code==422
    service.app.state.router=None

@pytest.fixture(autouse=True)
def reset_service_state():
    service.app.state.router = None
    service.app.state.evidence = {}
    service.cache.clear()
    service.clients.clear()
    yield
    service.app.state.router = None
    service.app.state.evidence = {}
    service.cache.clear()
    service.clients.clear()


def test_cached_evidence_stops_hiding_content_when_its_record_expires(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(service.time, 'time', lambda: clock[0])
    service.app.state.router = ExplicitTestDouble()
    service.app.state.evidence = {'video:expiry': {'source': 'https://example.org/verification', 'reason': 'Exact debunked claim', 'expires': 1001.0}}
    body = {'policy': {'verifiedFalse': True}, 'items': [{'id': 'video:expiry', 'text': 'ordinary text'}]}
    first = call('POST', '/v1/evaluate', body).json()['decisions'][0]
    assert first['hidden'] and first['engine'] == 'evidence'
    assert first['expires'] == 1001.0
    assert call('POST', '/v1/evaluate', body).json()['decisions'][0] == first
    clock[0] = 1002.0
    after = call('POST', '/v1/evaluate', body).json()['decisions'][0]
    assert not after['hidden'] and after['engine'] != 'evidence'


def test_removing_curated_evidence_invalidates_a_cached_evidence_decision():
    service.app.state.router = ExplicitTestDouble()
    service.app.state.evidence = {'video:removed': {'source': 'https://example.org/verification', 'reason': 'Exact debunked claim', 'expires': service.time.time() + 60}}
    body = {'policy': {'verifiedFalse': True}, 'items': [{'id': 'video:removed', 'text': 'ordinary text'}]}
    assert call('POST', '/v1/evaluate', body).json()['decisions'][0]['hidden']
    service.app.state.evidence.clear()
    assert not call('POST', '/v1/evaluate', body).json()['decisions'][0]['hidden']


def test_changed_evidence_uses_the_current_reason():
    service.app.state.router = ExplicitTestDouble()
    service.app.state.evidence = {'video:changed': {'source': 'https://example.org/verification', 'reason': 'Original correction', 'expires': service.time.time() + 60}}
    body = {'policy': {'verifiedFalse': True}, 'items': [{'id': 'video:changed', 'text': 'ordinary text'}]}
    assert 'Original correction' in call('POST', '/v1/evaluate', body).json()['decisions'][0]['reason']
    service.app.state.evidence['video:changed']['reason'] = 'Updated correction'
    assert 'Updated correction' in call('POST', '/v1/evaluate', body).json()['decisions'][0]['reason']
