import argon2, { type HashOptions } from "argon2";

export const PRODUCTION_PASSWORD_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
} satisfies HashOptions);

export interface PasswordService {
  hash(password: string): Promise<string>;
  verify(encodedHash: string, password: string): Promise<boolean>;
}

export function createPasswordService(options: HashOptions = PRODUCTION_PASSWORD_OPTIONS): PasswordService {
  const hashOptions: HashOptions = { ...options, type: argon2.argon2id };
  return {
    hash: password => argon2.hash(password, hashOptions),
    async verify(encodedHash, password) {
      try {
        return await argon2.verify(encodedHash, password);
      } catch {
        return false;
      }
    },
  };
}
