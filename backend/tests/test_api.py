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
