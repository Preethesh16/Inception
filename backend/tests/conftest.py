import os
import tempfile

os.environ["INCEPTION_DATA_DIR"] = tempfile.mkdtemp(prefix="inception-tests-")
os.environ["INCEPTION_FORECAST"] = "baseline"
import copy
import pytest
from inception.store import Store
from inception.seed import seed
from inception.demo import advance
from inception.worker import enqueue, run_job


@pytest.fixture(scope="session")
def reference(tmp_path_factory):
    store = Store(tmp_path_factory.mktemp("base") / "db.sqlite")
    seed(store)
    with store.transaction() as s:
        advance(s, 3)
    job = enqueue(store)
    run_job(store, job)
    return store.read()


@pytest.fixture
def state(reference):
    s = copy.deepcopy(reference)
    s["_events"] = []
    return s


@pytest.fixture
def store(tmp_path, reference):
    st = Store(tmp_path / "test.db")
    with st.transaction() as s:
        for key, value in reference.items():
            s[key] = copy.deepcopy(value)
    return st
