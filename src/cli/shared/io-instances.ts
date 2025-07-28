// src/cli/shared/io-instances.ts
import {
  createFileReader,
  createJsonWriter,
  createDirectoryReader,
  createDirectoryCreator,
  createPathChecker
} from '../../io/file-operations'

// Create I/O instances once for reuse across commands
export const io = {
  reader: createFileReader(),
  writer: createJsonWriter(),
  dirReader: createDirectoryReader(),
  dirCreator: createDirectoryCreator(),
  pathChecker: createPathChecker()
}