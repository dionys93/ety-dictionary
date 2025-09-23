import type { DataContent, ValidatedFile, ValidatedDirectory } from '../types/filesystem'

// PURE: Type predicates
export function isValidatedFile(entity: DataContent): entity is ValidatedFile {
  return entity.type === 'file'
}

export function isValidatedDirectory(entity: DataContent): entity is ValidatedDirectory {
  return entity.type === 'directory'
}