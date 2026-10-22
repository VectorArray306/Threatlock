import { App } from "aws-cdk-lib";
import { ThreatlockStack } from "./stack";
const app = new App();
new ThreatlockStack(app, "Threatlock", {
  env: { region: "ap-south-1" },
  integrationApproved: app.node.tryGetContext("integrationApproved") === "true",
  origin:
    app.node.tryGetContext("origin") ?? "https://presenter.example.invalid",
  budgetEmail:
    app.node.tryGetContext("budgetEmail") ?? "budget@example.invalid",
  domainPrefix:
    app.node.tryGetContext("domainPrefix") ??
    "threatlock-configure-before-deploy",
  modelId:
    app.node.tryGetContext("modelId") ?? "mistral.ministral-3-8b-instruct",
});
