import { CopyObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import http from "node:http";
import https from "node:https";
import { getUniqueFileName } from "./filename";
import { logger } from "./logger";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

/** Prefer IPv4 — LinkedIn/CDN Cloudflare often blocks datacenter IPv6. */
const ipv4HttpAgent = new http.Agent({ family: 4, keepAlive: true });
const ipv4HttpsAgent = new https.Agent({ family: 4, keepAlive: true });

const BROWSER_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function headersForAssetDownload(url: string): Record<string, string> {
    const headers: Record<string, string> = {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    };

    try {
        const { hostname, origin } = new URL(url);
        if (
            hostname === "licdn.com" ||
            hostname.endsWith(".licdn.com") ||
            hostname === "linkedin.com" ||
            hostname.endsWith(".linkedin.com")
        ) {
            headers.Referer = "https://www.linkedin.com/";
        } else {
            headers.Referer = `${origin}/`;
        }
    } catch {
        // Invalid URL — axios will surface the failure
    }

    return headers;
}

export async function getPresignedUrlForUpload(filename: string) {
    filename = getUniqueFileName(filename);

    const command = new PutObjectCommand({
        Bucket: process.env.AWS_STORAGE_BUCKET_NAME,
        Key: filename,
        ContentType: 'application/octet-stream'
    })

    const url = await getSignedUrl(s3Client(), command, { expiresIn: 3600 });

    return { filename: filename, url: url };
}

function s3Client() {
    return new S3Client({
        credentials: {
            accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY || ''
        },
        region: "us-east-1",
        endpoint: process.env.AWS_S3_ENDPOINT_URL || '',
        apiVersion: "v4"
    });
}

export async function getPresignedUrlForGet(filename: string) {
    if (!filename || !filename.trim()) {
        throw new Error("Filename cannot be empty when generating presigned URL");
    }

    const command = new GetObjectCommand({
        Bucket: process.env.AWS_STORAGE_BUCKET_NAME,
        Key: filename,
    });

    const url = await getSignedUrl(s3Client(), command, { expiresIn: 3600 });

    return {
        filename: filename,
        url: url
    };
}

/** Download object bytes from S3 by key. */
export async function downloadFileFromS3(filename: string): Promise<Buffer> {
    if (!filename || !filename.trim()) {
        throw new Error("Filename cannot be empty when downloading from S3");
    }

    const response = await s3Client().send(
        new GetObjectCommand({
            Bucket: process.env.AWS_STORAGE_BUCKET_NAME,
            Key: filename,
        }),
    );

    const body = response.Body;
    if (!body) throw new Error("Empty S3 object body");

    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
}

// Upload file directly to S3 using presigned URL
export async function uploadFileToS3(file: Buffer, filename: string): Promise<string> {
    const { url: uploadUrl, filename: storedFilename } = await getPresignedUrlForUpload(filename);

    const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: new Uint8Array(file),
        headers: {
            'Content-Type': 'application/octet-stream'
        }
    });

    if (!uploadResponse.ok) {
        throw new Error(`Failed to upload file: ${uploadResponse.statusText}`);
    }

    return storedFilename;
}

/** Upload bytes to an exact S3 key (no uniqueness prefix). */
export async function uploadFileToS3Key(file: Buffer, key: string): Promise<string> {
    if (!key.trim()) throw new Error("S3 key cannot be empty")

    const command = new PutObjectCommand({
        Bucket: process.env.AWS_STORAGE_BUCKET_NAME,
        Key: key,
        Body: file,
        ContentType: "application/octet-stream",
    })
    await s3Client().send(command)
    return key
}

/** Copy an existing object to a new key in the same bucket. */
export async function copyS3Object(sourceKey: string, destKey: string): Promise<string> {
    if (!sourceKey.trim() || !destKey.trim()) {
        throw new Error("S3 keys cannot be empty when copying")
    }

    const bucket = process.env.AWS_STORAGE_BUCKET_NAME
    await s3Client().send(
        new CopyObjectCommand({
            Bucket: bucket,
            CopySource: `${bucket}/${sourceKey}`,
            Key: destKey,
        }),
    )
    return destKey
}

/** List object keys under a prefix (paginated). */
export async function listS3KeysWithPrefix(prefix: string): Promise<string[]> {
    if (!prefix.trim()) return []

    const keys: string[] = []
    let continuationToken: string | undefined
    do {
        const response = await s3Client().send(
            new ListObjectsV2Command({
                Bucket: process.env.AWS_STORAGE_BUCKET_NAME,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            }),
        )
        for (const item of response.Contents ?? []) {
            if (item.Key) keys.push(item.Key)
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)

    return keys
}


// Helper function to download and upload URL to S3
export async function downloadAndUploadUrl(url: string): Promise<string | null> {
    try {
        logger.log(`[file] Downloading asset`);
        const response = await axios.get(url, {
            responseType: "arraybuffer",
            timeout: 30000, // 30 second timeout
            maxRedirects: 5,
            // Avoid axios defaults (UA axios/*, Accept application/json) that CDNs flag as bots
            headers: headersForAssetDownload(url),
            httpAgent: ipv4HttpAgent,
            httpsAgent: ipv4HttpsAgent,
        });

        const contentType = String(response.headers["content-type"] ?? "");
        if (contentType.includes("text/html")) {
            logger.error(`[file] Download returned HTML instead of asset (${contentType})`);
            return null;
        }

        // Convert to Buffer
        const buffer = Buffer.from(response.data);

        // Generate UUID filename
        const filename = `${uuidv4()}`;

        const storedFilename = await uploadFileToS3(buffer, filename);

        logger.log(`[file] Successfully uploaded file`);
        return storedFilename;
    } catch (error) {
        logger.error(`[file] Failed to download/upload URL`, error);
        return null;
    }
}