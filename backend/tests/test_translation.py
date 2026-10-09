import re
import pytest
from fastapi.testclient import TestClient
from inception import api
from inception import translation as tr
from types import SimpleNamespace


def test_translation_masks_facts_and_rejects_altered_values():
    original = 'Offer 200 ORS from A-ORS-02, expiry 2026-10-17. Pip: 7 days, 12.5%.'
    masked, values = tr.mask(original)
    assert '200' not in masked and 'A-ORS-02' not in masked
    assert tr.restore(masked, values) == original
    with pytest.raises(ValueError):
        tr.restore(masked + ' 99', values)
    with pytest.raises(ValueError):
        tr.restore(masked.replace('⟦0⟧', ''), values)


def test_language_validation_and_unavailable_fallback(monkeypatch):
    client = TestClient(api.app)
    assert client.post('/ui/translate', json={'language':'xx', 'texts':['Hello']}).status_code == 422
    assert client.post('/ui/translate', json={'language':'en', 'texts':['Hello 200']}).json()['translations'] == ['Hello 200']
    monkeypatch.setenv('OPENAI_API_KEY','')
    response=client.post('/ui/translate', json={'language':'kn','texts':['Unavailable translation test']})
    assert response.status_code == 503
    assert 'English' in response.json()['detail']
    assert client.post('/ui/translate', json={'language':'hi','texts':['x'*12001]}).status_code == 422


def test_batch_translation_and_cache_preserve_facts(monkeypatch):
    import openai
    calls=[]
    def parse(**kwargs):
        import json
        inputs=json.loads(kwargs['input'][1]['content'])
        calls.append(inputs)
        return SimpleNamespace(output_parsed=tr.TranslatedStrings(translations=['अनुवाद '+t for t in inputs]))
    monkeypatch.setenv('OPENAI_API_KEY','test-only')
    monkeypatch.setattr(openai,'OpenAI',lambda **kwargs: SimpleNamespace(responses=SimpleNamespace(parse=parse)))
    texts=['Unique test stock 200 ORS in A-ORS-02','Unique next value 17.5']
    result=tr.translate('hi',texts)
    assert '200 ORS' in result[0] and 'A-ORS-02' in result[0]
    assert '17.5' in result[1]
    assert tr.translate('hi',texts)==result and len(calls)==1
    assert len(tr.LANGUAGES)==23


def test_available_catalogs_have_complete_coverage_and_correct_scripts():
    import json
    from inception.config import ROOT
    root=ROOT / 'frontend/src/i18n/catalogs'
    source=json.loads((root / 'source.json').read_text())
    for language in ('hi','kn','ta','te'):
        catalog=json.loads((root / (language+'.json')).read_text())
        assert set(catalog) == set(source)
        assert all(isinstance(v,str) and v.strip() for v in catalog.values())
        for original, translated in catalog.items():
            tr.validate_script(language,translated)
            # All numeric facts stay in their original form and count.
            assert sorted(re.findall(r'\d+(?:[.,:/+–-]\d+)*(?:%|\+)?', original)) == sorted(re.findall(r'\d+(?:[.,:/+–-]\d+)*(?:%|\+)?', translated))


def test_mixed_script_is_rejected():
    with pytest.raises(ValueError):
        tr.validate_script('kn','ಕನ್ನಡ മലയാളം')
