IMAGE ?= entryserver
TAG ?= 0.1.0
NAMESPACE ?= entryserver
RELEASE ?= entryserver

.PHONY: build-image run-image compose-up compose-down helm-template helm-install

build-image:
	docker build -t $(IMAGE):$(TAG) .

run-image:
	docker run -d --name entryserver --restart unless-stopped --env-file .env -p 3000:3000 $(IMAGE):$(TAG)

compose-up:
	docker compose up --build -d

compose-down:
	docker compose down

helm-template:
	helm template $(RELEASE) ./charts/entryserver --namespace $(NAMESPACE)

helm-install:
	helm upgrade --install $(RELEASE) ./charts/entryserver --namespace $(NAMESPACE) --create-namespace
