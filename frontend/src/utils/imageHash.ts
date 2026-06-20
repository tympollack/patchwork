import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

/**
 * Calculates the SHA-256 hash of an image file.
 * @param imageUri - The URI of the image file to hash
 * @returns A promise that resolves to the SHA-256 hash as a hex string
 * @throws Error if the file doesn't exist or cannot be read
 */
export async function calculateImageHash(imageUri: string): Promise<string> {
  try {
    const file = new File(imageUri);
    
    if (!file.exists) {
      throw new Error(`File does not exist: ${imageUri}`);
    }

    const fileBytes = await file.bytes();
    
    const digest = await Crypto.digest(
      Crypto.CryptoDigestAlgorithm.SHA256,
      fileBytes
    );
    
    return digest;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to calculate image hash: ${error.message}`);
    }
    throw new Error('Failed to calculate image hash: Unknown error');
  }
}
