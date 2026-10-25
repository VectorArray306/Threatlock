#!/usr/bin/env bash
# Write gitignored Vite cloud settings from the deployed Threatlock stack.
# Public endpoint values only. Does not print or store credentials.
set -euo pipefail
region="${AWS_REGION:-ap-south-1}"
stack="${THREATLOCK_STACK:-Threatlock}"
query() {
  aws cloudformation describe-stacks \
    --region "$region" \
    --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}
api="$(query ApiUrl)"
domain="$(query CognitoDomain)"
client="$(query ClientId)"
test -n "$api" && test "$api" != "None"
test -n "$domain" && test "$domain" != "None"
test -n "$client" && test "$client" != "None"
cat > .env.local <<EOF
VITE_APP_MODE=cloud
VITE_API_URL=${api}
VITE_COGNITO_DOMAIN=${domain}
VITE_COGNITO_CLIENT_ID=${client}
EOF
echo "Wrote .env.local for cloud mode from stack ${stack} in ${region}."
echo "Presenter credentials belong in gitignored .presenter.local (see .presenter.local.example)."
