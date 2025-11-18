/**
 * File-Based Task Coordinator
 *
 * Coordinates multiple Code instances through shared file system.
 * Pattern inspired by headless-pm's file-based MCP client tracking.
 *
 * Architecture:
 * 1. Bridge writes task spec to file
 * 2. Bridge spawns Code subprocess (direct spawn, not via MCP)
 * 3. Code completes task, writes result to file
 * 4. Bridge polls for result
 *
 * No recursive MCP calls = No deadlock
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { ClaudeCodeResult } from '../types';

export interface TaskSpec {
  taskId: string;
  prompt: string;
  mcpConfigPath?: string;
  permissionMode?: 'ask' | 'bypassPermissions' | 'allowAll';
  dangerouslySkipPermissions?: boolean;
  timeout?: number;
  createdAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  result?: string;
  error?: string;
  completedAt: number;
  executionTime: number;
}

export class FileCoordinator {
  private tasksDir: string;
  private debug: boolean;

  constructor(debug: boolean = false) {
    this.debug = debug;
    this.tasksDir = path.join(os.tmpdir(), 'claude-code-bridge-tasks');
  }

  /**
   * Initialize coordinator - create tasks directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.tasksDir, { recursive: true });
      if (this.debug) {
        console.error('[FileCoordinator] Initialized tasks directory:', this.tasksDir);
      }
    } catch (error) {
      console.error('[FileCoordinator] Failed to create tasks directory:', error);
      throw error;
    }
  }

  /**
   * Create a new task and spawn Code subprocess
   */
  async createTask(
    prompt: string,
    mcpConfigPath?: string,
    options?: {
      permissionMode?: 'ask' | 'bypassPermissions' | 'allowAll';
      dangerouslySkipPermissions?: boolean;
      timeout?: number;
      claudeCodePath?: string;
    }
  ): Promise<string> {
    const taskId = this.generateTaskId();
    const taskSpec: TaskSpec = {
      taskId,
      prompt,
      mcpConfigPath,
      permissionMode: options?.permissionMode || 'ask',
      dangerouslySkipPermissions: options?.dangerouslySkipPermissions || false,
      timeout: options?.timeout || 120000,
      createdAt: Date.now(),
      status: 'pending',
    };

    // Write task spec to file
    const taskPath = this.getTaskPath(taskId);
    await fs.writeFile(taskPath, JSON.stringify(taskSpec, null, 2), 'utf-8');

    if (this.debug) {
      console.error('[FileCoordinator] Created task:', taskId);
      console.error('[FileCoordinator] Task file:', taskPath);
    }

    // Spawn Code subprocess directly (NOT via MCP)
    await this.spawnCodeSubprocess(taskId, taskSpec, options?.claudeCodePath || 'claude');

    return taskId;
  }

  /**
   * Spawn Code subprocess to execute task
   */
  private async spawnCodeSubprocess(
    taskId: string,
    taskSpec: TaskSpec,
    claudeCodePath: string
  ): Promise<void> {
    // Build CLI arguments
    const args: string[] = [
      '--print',
      '--verbose',
      '--output-format',
      'stream-json',
    ];

    // Add permission mode
    if (taskSpec.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    } else if (taskSpec.permissionMode === 'bypassPermissions') {
      args.push('--permission-mode', 'bypassPermissions');
    }

    // Add MCP config if provided
    if (taskSpec.mcpConfigPath) {
      args.push('--mcp-config', taskSpec.mcpConfigPath);
    }

    // CRITICAL: Add -- separator before prompt
    args.push('--');
    args.push(taskSpec.prompt);

    if (this.debug) {
      console.error('[FileCoordinator] Spawning Code subprocess for task:', taskId);
      console.error('[FileCoordinator] Command:', claudeCodePath, args.join(' '));
    }

    // Update task status to running
    taskSpec.status = 'running';
    await fs.writeFile(this.getTaskPath(taskId), JSON.stringify(taskSpec, null, 2), 'utf-8');

    // Spawn subprocess
    const proc = spawn(claudeCodePath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    // Collect stdout for result
    let stdout = '';
    let finalResult: ClaudeCodeResult | null = null;

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach((line: string) => {
        if (!line.trim()) return;
        try {
          const json = JSON.parse(line);
          if (json.type === 'result') {
            finalResult = json;
          }
          stdout += line + '\n';
        } catch (e) {
          stdout += line + '\n';
        }
      });
    });

    // Collect stderr for debugging
    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle process completion
    proc.on('close', async (code) => {
      const result: TaskResult = {
        taskId,
        success: code === 0 && finalResult?.subtype === 'success',
        completedAt: Date.now(),
        executionTime: Date.now() - taskSpec.createdAt,
      };

      if (finalResult?.subtype === 'success') {
        result.result = finalResult.result || 'Task completed successfully';
      } else if (finalResult?.subtype === 'error') {
        result.success = false;
        result.error = finalResult.result || 'Unknown error';
      } else {
        result.success = false;
        result.error = `Process exited with code ${code}`;
      }

      // Write result to file
      await fs.writeFile(this.getResultPath(taskId), JSON.stringify(result, null, 2), 'utf-8');

      if (this.debug) {
        console.error('[FileCoordinator] Task completed:', taskId);
        console.error('[FileCoordinator] Success:', result.success);
        console.error('[FileCoordinator] Execution time:', result.executionTime, 'ms');
      }
    });

    // Handle timeout
    setTimeout(async () => {
      if (proc.exitCode === null) {
        proc.kill('SIGTERM');
        const result: TaskResult = {
          taskId,
          success: false,
          error: `Task timeout after ${taskSpec.timeout}ms`,
          completedAt: Date.now(),
          executionTime: Date.now() - taskSpec.createdAt,
        };
        await fs.writeFile(this.getResultPath(taskId), JSON.stringify(result, null, 2), 'utf-8');
      }
    }, taskSpec.timeout!);
  }

  /**
   * Wait for task to complete and return result
   */
  async waitForResult(taskId: string, timeout: number = 120000): Promise<TaskResult> {
    const startTime = Date.now();
    const pollInterval = 500; // Poll every 500ms
    const resultPath = this.getResultPath(taskId);

    while (Date.now() - startTime < timeout) {
      try {
        // Check if result file exists
        const resultContent = await fs.readFile(resultPath, 'utf-8');
        const result: TaskResult = JSON.parse(resultContent);

        if (this.debug) {
          console.error('[FileCoordinator] Retrieved result for task:', taskId);
        }

        // Clean up task files
        await this.cleanupTask(taskId);

        return result;
      } catch (error) {
        // Result not ready yet, wait and retry
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    // Timeout waiting for result
    throw new Error(`Timeout waiting for task result after ${timeout}ms`);
  }

  /**
   * Execute task and wait for result (convenience method)
   */
  async executeTask(
    prompt: string,
    mcpConfigPath?: string,
    options?: {
      permissionMode?: 'ask' | 'bypassPermissions' | 'allowAll';
      dangerouslySkipPermissions?: boolean;
      timeout?: number;
      claudeCodePath?: string;
    }
  ): Promise<TaskResult> {
    const taskId = await this.createTask(prompt, mcpConfigPath, options);
    return await this.waitForResult(taskId, options?.timeout || 120000);
  }

  /**
   * Get task spec
   */
  async getTask(taskId: string): Promise<TaskSpec | null> {
    try {
      const taskPath = this.getTaskPath(taskId);
      const content = await fs.readFile(taskPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get task result
   */
  async getResult(taskId: string): Promise<TaskResult | null> {
    try {
      const resultPath = this.getResultPath(taskId);
      const content = await fs.readFile(resultPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * Clean up task files
   */
  async cleanupTask(taskId: string): Promise<void> {
    try {
      await fs.unlink(this.getTaskPath(taskId));
    } catch (e) {
      // Ignore if task file doesn't exist
    }

    try {
      await fs.unlink(this.getResultPath(taskId));
    } catch (e) {
      // Ignore if result file doesn't exist
    }
  }

  /**
   * Clean up all old tasks (older than 1 hour)
   */
  async cleanupOldTasks(): Promise<void> {
    try {
      const files = await fs.readdir(this.tasksDir);
      const now = Date.now();
      const maxAge = 60 * 60 * 1000; // 1 hour

      for (const file of files) {
        const filePath = path.join(this.tasksDir, file);
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath);
          if (this.debug) {
            console.error('[FileCoordinator] Cleaned up old file:', file);
          }
        }
      }
    } catch (error) {
      console.error('[FileCoordinator] Error cleaning up old tasks:', error);
    }
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get path to task spec file
   */
  private getTaskPath(taskId: string): string {
    return path.join(this.tasksDir, `${taskId}.json`);
  }

  /**
   * Get path to task result file
   */
  private getResultPath(taskId: string): string {
    return path.join(this.tasksDir, `${taskId}-result.json`);
  }
}
