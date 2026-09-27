#!/usr/bin/env bash
# Configura o Workload Identity Federation usado pelo .github/workflows/deploy.yml.
# Rodar uma vez no Cloud Shell (https://shell.cloud.google.com), logado como dono dos
# dois projetos:  bash configurar-wif.sh
# Idempotente: o que já existe é mantido. No fim imprime as variáveis do GitHub.
set -euo pipefail

REPO="andreehgomes/fed-catalogo-compara-precos"
PROJ_POOL="fed-catalogo-compara-precos"
POOL="github"
PROVIDER="github-actions"
SA_NOME="deploy-github"

# projeto:ambiente do GitHub (o sub do token OIDC é repo:<repo>:environment:<ambiente>)
ALVOS=("fed-catalogo-compara-precos:producao" "fed-catalogo-compara-precos-dv:dv")

PAPEIS=(
  roles/firebase.admin
  roles/cloudfunctions.admin
  roles/run.admin
  roles/cloudscheduler.admin
  roles/artifactregistry.admin
  roles/iam.serviceAccountUser
  roles/serviceusage.serviceUsageConsumer
)

NUM_POOL=$(gcloud projects describe "$PROJ_POOL" --format='value(projectNumber)')

for alvo in "${ALVOS[@]}"; do
  gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
    cloudresourcemanager.googleapis.com --project "${alvo%%:*}"
done

gcloud iam workload-identity-pools describe "$POOL" --project "$PROJ_POOL" --location global \
  >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --project "$PROJ_POOL" --location global \
    --display-name "GitHub Actions"

gcloud iam workload-identity-pools providers describe "$PROVIDER" --project "$PROJ_POOL" \
  --location global --workload-identity-pool "$POOL" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project "$PROJ_POOL" \
    --location global --workload-identity-pool "$POOL" --display-name "GitHub" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition "assertion.repository == '$REPO'"

for alvo in "${ALVOS[@]}"; do
  projeto="${alvo%%:*}"
  ambiente="${alvo##*:}"
  sa="$SA_NOME@$projeto.iam.gserviceaccount.com"

  gcloud iam service-accounts describe "$sa" --project "$projeto" >/dev/null 2>&1 ||
    gcloud iam service-accounts create "$SA_NOME" --project "$projeto" \
      --display-name "Deploy pelo GitHub Actions"

  for papel in "${PAPEIS[@]}"; do
    gcloud projects add-iam-policy-binding "$projeto" --member "serviceAccount:$sa" \
      --role "$papel" --condition None --quiet >/dev/null
  done

  # Só o job no ambiente certo deste repositório pode assumir a conta.
  gcloud iam service-accounts add-iam-policy-binding "$sa" --project "$projeto" \
    --role roles/iam.workloadIdentityUser \
    --member "principal://iam.googleapis.com/projects/$NUM_POOL/locations/global/workloadIdentityPools/$POOL/subject/repo:$REPO:environment:$ambiente" \
    --quiet >/dev/null
done

echo
echo "Variáveis do repositório (GitHub → Settings → Secrets and variables → Actions → Variables):"
echo "  WIF_PROVIDER           = projects/$NUM_POOL/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo "  WIF_SERVICE_ACCOUNT    = $SA_NOME@fed-catalogo-compara-precos.iam.gserviceaccount.com"
echo "  WIF_SERVICE_ACCOUNT_DV = $SA_NOME@fed-catalogo-compara-precos-dv.iam.gserviceaccount.com"
