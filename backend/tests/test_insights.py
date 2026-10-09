import copy
from inception.insights import usage_plan
from inception.engine import simulate,batches_for,arrivals_for
from inception import api
from fastapi.testclient import TestClient


def test_insights_match_engine_and_do_not_mutate(state):
    before=copy.deepcopy(state)
    fid,sid='A','ORS'
    f=state['forecasts'][fid+':'+sid]
    result=usage_plan(state,fid,sid)
    expected=simulate(batches_for(state,fid,sid),f['planning'],state['settings']['demo']['as_of'],arrivals_for(state,fid,sid))
    assert result['status']=='ready'
    assert abs(sum(a['quantity'] for d in result['days'] for a in d['allocations'])-sum(expected['consumed'].values()))<.1
    assert result['unmet']==expected['unmet'] and result['waste']==expected['waste']
    assert state==before


def test_expired_reserved_and_quarantined_never_recommended(state):
    s=state
    own=[b for b in s['batches'].values() if b['facility_id']=='A' and b['supply_id']=='ORS']
    own[0]['expires_at']=s['settings']['demo']['as_of']
    own[1]['reserved']=own[1]['quantity']
    plan=usage_plan(s,'A','ORS',7)
    assert all(l['used']==0 for l in plan['lots'] if not l['incoming'])
    own[1]['reserved']=0;own[1]['quarantined']=True
    plan=usage_plan(s,'A','ORS',7)
    assert next(l for l in plan['lots'] if l['id']==own[1]['id'])['excluded_reason']=='Quarantined'


def test_insights_are_scoped_and_stale_forecasts_are_not_advice(store,monkeypatch):
    monkeypatch.setattr(api,'store',store)
    c=TestClient(api.app)
    assert c.get('/inventory/insights?supply_id=ORS').status_code==401
    response=c.get('/inventory/insights?supply_id=ORS&horizon=7',headers={'X-Demo-Session':'demo-A'})
    assert response.status_code==200
    assert response.json()['facility_id']=='A'
    assert c.get('/inventory/insights?supply_id=ORS&horizon=100',headers={'X-Demo-Session':'demo-A'}).status_code==422
    with store.transaction() as s:s['settings']['demo']['revision']+=1
    assert c.get('/inventory/insights?supply_id=ORS&horizon=7',headers={'X-Demo-Session':'demo-A'}).json()['status']=='updating'
