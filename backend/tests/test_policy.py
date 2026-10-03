import time
import pytest
from service import Policy, Item, deterministic, decide, questions

def item(text="Ordinary video", creator="Someone"):
    return Item(id="video:123", text=text, creator=creator)

@pytest.mark.parametrize("text", ["class", "document", "assume", "mass", "madam", "medical sexual health education", "Constructive criticism of India's government"])
def test_preserve_benign_text(text):
    assert deterministic(item(text), Policy()) is None

@pytest.mark.parametrize("text", ["f*ck", "b*tch", "ch**iya", "मादरचोद", "f\u200buck"])
def test_obfuscated_abuse(text):
    assert deterministic(item(text), Policy()) == "Abusive language in metadata"

def test_excluded_creator_overrides_allow():
    p=Policy(allowedCreators=["Someone"],excludedCreators=["Someone"],topics=["Science"])
    assert deterministic(item(), p)=="Excluded creator"

def test_safety_stays_active_while_paused():
    assert deterministic(item("p0rn"),Policy(enabled=False))=="Explicit metadata"
    assert decide(item(), Policy(enabled=False), {"explicit":{"noul":.99}}, {})[0]

def test_allowed_creator_does_not_bypass_abuse():
    p=Policy(allowedCreators=["Someone"])
    assert decide(item(),p,{"abuse":{"noul":.99}}, {})[0]

def test_any_all_and_uncertainty():
    answers={"topic:Science":{"noul":.95},"topic:Music":{"noul":.05}}
    assert not decide(item(),Policy(topics=["Science","Music"],mode="ANY"),answers,{})[0]
    assert decide(item(),Policy(topics=["Science","Music"],mode="ALL"),answers,{})[0]
    assert not decide(item(),Policy(topics=["Science"]),{}, {})[0]

def test_truth_requires_current_content_specific_evidence():
    p=Policy(verifiedFalse=True)
    assert not decide(item("India criticism"),p,{}, {})[0]
    evidence={"video:123":{"reason":"Exact debunked claim","source":"https://example.org/verification","expires":time.time()+10}}
    assert decide(item(),p,{},evidence)[2]=="evidence"
    evidence['video:123']['expires']=0
    assert not decide(item(),p,{},evidence)[0]

def test_safety_topic_and_spam_heads_are_independent():
    q=questions(item(),Policy(topics=["Science"],spam=True))
    assert {"explicit","abuse","spam","topic:Science"}<=set(q)
    assert not any("truth" in key or "AI" in key for key in q)
