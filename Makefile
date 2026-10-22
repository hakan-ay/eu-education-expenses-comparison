PY := .venv/bin/python

.PHONY: setup data extract parse build test web dev clean

setup:            ## create the Python venv and install web dependencies
	python3 -m venv .venv && $(PY) -m pip install -q -r requirements.txt
	npm --prefix web ci

data: extract parse build   ## full pipeline: download -> parse -> SQL model + tests -> JSON

extract:
	$(PY) -m pipeline.extract

parse:
	$(PY) -m pipeline.parse

build:
	$(PY) -m pipeline.build

test:             ## data tests on the committed snapshot, no downloads (what CI runs)
	$(PY) -m pipeline.build --from-snapshot

web:              ## production build of the dashboard (web/dist)
	npm --prefix web run build

dev:              ## local dashboard at http://localhost:5173
	npm --prefix web run dev

clean:
	rm -rf data/raw data/interim data/warehouse.duckdb web/dist
