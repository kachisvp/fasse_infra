import { KMSClient, SignCommand } from '@aws-sdk/client-kms';

const kms = new KMSClient({});

// dev環境・stg環境ともに30日(docs/spec/authentication REQ-105)。
// prod環境の短縮方針はprod環境構築時に別途決定する。
const JWT_EXP_SECONDS = 30 * 24 * 60 * 60;

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

export interface IssueJwtParams {
  sub: string;
  keyId: string;
  issuer: string;
}

// ルートA・ルートB共通のKMS署名処理(docs/spec/authentication design.md 3.1)。
// KeySpec RSA_2048のKMS非対称鍵に対し、RSASSA_PKCS1_V1_5_SHA_256(alg: RS256)で署名する。
export async function issueJwt({ sub, keyId, issuer }: IssueJwtParams): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub,
    iss: issuer,
    iat: now,
    exp: now + JWT_EXP_SECONDS,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signedData = `${headerB64}.${payloadB64}`;

  const result = await kms.send(
    new SignCommand({
      KeyId: keyId,
      Message: Buffer.from(signedData),
      MessageType: 'RAW',
      SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
    }),
  );

  if (!result.Signature) {
    throw new Error('KMS Sign did not return a signature');
  }

  const signatureB64 = base64UrlEncode(Buffer.from(result.Signature));
  return `${signedData}.${signatureB64}`;
}
