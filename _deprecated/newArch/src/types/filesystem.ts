// Branded types for filesystem entities
export type FilePath = string & { readonly __brand: 'FilePath' }
export type DirectoryPath = string & { readonly __brand: 'DirectoryPath' }
export type DataTextDir = DirectoryPath & { readonly __constraint: 'data-text' }

export type FileSystemEntity = {
  readonly path: string
  readonly name: string
  readonly stats: {
    readonly size: number
    readonly modifiedTime: Date
    readonly createdTime: Date
  }
}

export type ValidatedFile = FileSystemEntity & {
  readonly type: 'file'
  readonly extension: string
  readonly path: FilePath
}

export type ValidatedDirectory = FileSystemEntity & {
  readonly type: 'directory'
  readonly path: DirectoryPath
}

export type DataContent = ValidatedFile | ValidatedDirectory