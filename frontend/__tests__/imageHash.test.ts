import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { calculateImageHash } from '../src/utils/imageHash';

jest.mock('expo-crypto');
jest.mock('expo-file-system');

describe('calculateImageHash', () => {
  const mockImageUri = 'file:///path/to/image.jpg';
  const mockFileBytes = new Uint8Array([1, 2, 3, 4, 5]);
  const mockHash = 'a1b2c3d4e5f6';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully calculate SHA-256 hash for a valid image file', async () => {
    const mockFile = {
      exists: true,
      bytes: jest.fn().mockResolvedValue(mockFileBytes),
    };

    (File as jest.MockedClass<typeof File>).mockImplementation(() => mockFile as any);
    (Crypto.digest as jest.Mock).mockResolvedValue(mockHash);

    const result = await calculateImageHash(mockImageUri);

    expect(File).toHaveBeenCalledWith(mockImageUri);
    expect(mockFile.bytes).toHaveBeenCalled();
    expect(Crypto.digest).toHaveBeenCalledWith(
      Crypto.CryptoDigestAlgorithm.SHA256,
      mockFileBytes
    );
    expect(result).toBe(mockHash);
  });

  it('should throw an error if the file does not exist', async () => {
    const mockFile = {
      exists: false,
      bytes: jest.fn(),
    };

    (File as jest.MockedClass<typeof File>).mockImplementation(() => mockFile as any);

    await expect(calculateImageHash(mockImageUri)).rejects.toThrow(
      `Failed to calculate image hash: File does not exist: ${mockImageUri}`
    );

    expect(File).toHaveBeenCalledWith(mockImageUri);
    expect(mockFile.bytes).not.toHaveBeenCalled();
    expect(Crypto.digest).not.toHaveBeenCalled();
  });

  it('should throw an error if file.bytes() fails', async () => {
    const mockFile = {
      exists: true,
      bytes: jest.fn().mockRejectedValue(new Error('Permission denied')),
    };

    (File as jest.MockedClass<typeof File>).mockImplementation(() => mockFile as any);

    await expect(calculateImageHash(mockImageUri)).rejects.toThrow(
      'Failed to calculate image hash: Permission denied'
    );

    expect(File).toHaveBeenCalledWith(mockImageUri);
    expect(mockFile.bytes).toHaveBeenCalled();
    expect(Crypto.digest).not.toHaveBeenCalled();
  });

  it('should throw an error if Crypto.digest fails', async () => {
    const mockFile = {
      exists: true,
      bytes: jest.fn().mockResolvedValue(mockFileBytes),
    };

    (File as jest.MockedClass<typeof File>).mockImplementation(() => mockFile as any);
    (Crypto.digest as jest.Mock).mockRejectedValue(new Error('Crypto operation failed'));

    await expect(calculateImageHash(mockImageUri)).rejects.toThrow(
      'Failed to calculate image hash: Crypto operation failed'
    );

    expect(File).toHaveBeenCalledWith(mockImageUri);
    expect(mockFile.bytes).toHaveBeenCalled();
    expect(Crypto.digest).toHaveBeenCalledWith(
      Crypto.CryptoDigestAlgorithm.SHA256,
      mockFileBytes
    );
  });

  it('should handle empty file (zero bytes)', async () => {
    const emptyBytes = new Uint8Array([]);
    const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    const mockFile = {
      exists: true,
      bytes: jest.fn().mockResolvedValue(emptyBytes),
    };

    (File as jest.MockedClass<typeof File>).mockImplementation(() => mockFile as any);
    (Crypto.digest as jest.Mock).mockResolvedValue(emptyHash);

    const result = await calculateImageHash(mockImageUri);

    expect(result).toBe(emptyHash);
    expect(Crypto.digest).toHaveBeenCalledWith(
      Crypto.CryptoDigestAlgorithm.SHA256,
      emptyBytes
    );
  });

  it('should handle different file URIs correctly', async () => {
    const differentUris = [
      'file:///storage/emulated/0/DCIM/photo.jpg',
      'file:///var/mobile/Containers/Data/image.png',
      'content://media/external/images/media/123',
    ];

    for (const uri of differentUris) {
      const mockFile = {
        exists: true,
        bytes: jest.fn().mockResolvedValue(mockFileBytes),
      };

      (File as jest.MockedClass<typeof File>).mockImplementation(() => mockFile as any);
      (Crypto.digest as jest.Mock).mockResolvedValue(mockHash);

      await calculateImageHash(uri);

      expect(File).toHaveBeenCalledWith(uri);
    }
  });

  it('should handle non-Error exceptions gracefully', async () => {
    const mockFile = {
      exists: true,
      bytes: jest.fn().mockRejectedValue('String error'),
    };

    (File as jest.MockedClass<typeof File>).mockImplementation(() => mockFile as any);

    await expect(calculateImageHash(mockImageUri)).rejects.toThrow(
      'Failed to calculate image hash: Unknown error'
    );
  });
});
