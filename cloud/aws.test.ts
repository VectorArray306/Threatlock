import { afterEach, describe, it, expect, vi } from "vitest";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { TextractClient } from "@aws-sdk/client-textract";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { ports } from "./aws";
afterEach(() => vi.restoreAllMocks());
describe("AWS SDK ports without network", () => {
  it("atomically stores cache and incident, with absent-key conditions", async () => {
    const send = vi
      .spyOn(DynamoDBDocumentClient.prototype, "send")
      .mockResolvedValue({} as never);
    await ports.commit(
      "user#u#assessment#assessment1",
      { fingerprint: "hash", result: { status: "allowed" } },
      "user#u#incident#assessment1",
      { id: "assessment1", time: "2026-10-22", reason: "CLEAR" },
    );
    const input = (
      send.mock.calls[0][0] as {
        input: {
          TransactItems: {
            Put: { Item: Record<string, unknown>; ConditionExpression: string };
          }[];
        };
      }
    ).input;
    expect(input.TransactItems).toHaveLength(2);
    expect(input.TransactItems[1].Put.Item.partition).toBe("user#u#incident");
    expect(
      input.TransactItems.every(
        (item) => item.Put.ConditionExpression === "attribute_not_exists(pk)",
      ),
    ).toBe(true);
  });
  it("does not put undefined partition values in upload metadata", async () => {
    const send = vi
      .spyOn(DynamoDBDocumentClient.prototype, "send")
      .mockResolvedValue({} as never);
    await ports.put("user#u#upload#upload123", { key: "u/upload123" });
    const input = (
      send.mock.calls[0][0] as { input: { Item: Record<string, unknown> } }
    ).input;
    expect(input.Item).not.toHaveProperty("partition");
  });
  it("bounds S3 object size before reading the response body", async () => {
    const read = vi.fn();
    vi.spyOn(S3Client.prototype, "send").mockResolvedValue({
      ContentLength: 1024 * 1024 + 1,
      Body: { transformToByteArray: read },
    } as never);
    await expect(ports.read("u/upload123")).rejects.toThrow("Oversize");
    expect(read).not.toHaveBeenCalled();
  });
  it("extracts only OCR line text", async () => {
    const send = vi.spyOn(TextractClient.prototype, "send").mockResolvedValue({
      Blocks: [
        { BlockType: "WORD", Text: "ignore" },
        { BlockType: "LINE", Text: "Public agenda" },
      ],
    } as never);
    expect(await ports.ocr(new Uint8Array([1]))).toBe("Public agenda");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("calls Bedrock Converse with bounded tokens and untrusted contextual input", async () => {
    const send = vi
      .spyOn(BedrockRuntimeClient.prototype, "send")
      .mockResolvedValue({
        output: { message: { content: [{ text: '{"status":"allowed"}' }] } },
      } as never);
    await expect(ports.ai('{"draft":"public agenda"}')).resolves.toEqual({
      status: "allowed",
    });
    const input = (
      send.mock.calls[0][0] as {
        input: {
          system: { text: string }[];
          inferenceConfig: { maxTokens: number };
        };
      }
    ).input;
    expect(input.system[0].text).toContain("untrusted");
    expect(input.inferenceConfig.maxTokens).toBe(300);
  });
});
