// src/utils/console-utils.ts
/**
 * Log a message to the console
 * @param message - The message to log
 */
export const log = (message: string): void => {
    console.log(message);
  };
  
  /**
   * Log an error message to the console
   * @param message - The error message to log
   * @param error - The error object, if available
   */
  export const logError = (message: string, error?: any): void => {
    console.error(message, error || '');
  };
  
  /**
   * Log a debug message to the console (only when DEBUG is enabled)
   * @param message - The debug message to log
   * @param data - Additional data to log
   */
  export const logDebug = (message: string, data?: any): void => {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${message}`);
      if (data !== undefined) {
        console.log(data);
      }
    }
  };
  
  /**
   * Log a successful conversion
   * @param source - Source file path
   * @param target - Target file path
   */
  export const logConversion = (source: string, target: string): void => {
    console.log(`Converted: ${source} -> ${target}`);
  };
  
  /**
   * Log the start of a conversion process
   * @param sourceDir - Source directory
   * @param targetDir - Target directory
   * @param pipelineType - Pipeline type being used
   */
  export const logStart = (sourceDir: string, targetDir: string, pipelineType: string): void => {
    console.log(`Starting conversion from ${sourceDir} to ${targetDir}...`);
    console.log(`Using pipeline: ${pipelineType}`);
  };
  
  /**
   * Log the completion of a conversion process
   */
  export const logCompletion = (): void => {
    console.log('Conversion completed!');
  };