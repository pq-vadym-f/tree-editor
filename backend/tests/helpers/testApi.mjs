import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))

export async function createTestApi({ environment = 'Production' } = {}) {
  const databaseName = `tree_editor_test_${randomUUID().replaceAll('-', '')}`
  const executeSql = (sqlStatement, targetDatabaseName = databaseName) =>
    execFileSync(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'db',
        'psql',
        '-U',
        'tree_editor',
        '-d',
        targetDatabaseName,
        '-v',
        'ON_ERROR_STOP=1',
        '-Atc',
        sqlStatement,
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim()

  let apiProcess
  let apiBaseUrl
  let databaseCreated = false

  async function stop() {
    if (apiProcess && apiProcess.exitCode === null && apiProcess.signalCode === null) {
      const processExited = new Promise(resolve => apiProcess.once('exit', resolve))
      apiProcess.kill()
      await processExited
    }
  }

  async function start() {
    const portReservationServer = createServer()
    await new Promise(resolve => portReservationServer.listen(0, '127.0.0.1', resolve))
    const availablePort = portReservationServer.address().port
    await new Promise(resolve => portReservationServer.close(resolve))

    apiBaseUrl = `http://127.0.0.1:${availablePort}`
    let apiProcessOutput = ''
    let processStartError

    apiProcess = spawn(
      'dotnet',
      ['backend/src/TreeEditor.Api/bin/Debug/net10.0/TreeEditor.Api.dll', '--urls', apiBaseUrl],
      {
        cwd: repositoryRoot,
        windowsHide: true,
        env: {
          ...process.env,
          ASPNETCORE_ENVIRONMENT: environment,
          DOTNET_ENVIRONMENT: environment,
          ConnectionStrings__TreeEditor:
            `Host=127.0.0.1;Port=5432;Database=${databaseName};` +
            'Username=tree_editor;Password=dev_password',
          Logging__LogLevel__Default: 'Warning',
        },
      },
    )

    apiProcess.on('error', error => {
      processStartError = error
    })
    apiProcess.stdout.on('data', outputChunk => {
      apiProcessOutput = (apiProcessOutput + outputChunk).slice(-65536)
    })
    apiProcess.stderr.on('data', outputChunk => {
      apiProcessOutput = (apiProcessOutput + outputChunk).slice(-65536)
    })

    for (let startupAttempt = 0; startupAttempt < 300; startupAttempt++) {
      if (processStartError) {
        throw processStartError
      }

      if (apiProcess.exitCode !== null) {
        throw new Error(`API exited: ${apiProcessOutput}`)
      }

      try {
        if ((await fetch(`${apiBaseUrl}/api/health`)).ok) {
          return
        }
      } catch {}

      await delay(100)
    }

    throw new Error(`API startup timed out: ${apiProcessOutput}`)
  }

  async function dispose() {
    await stop()

    if (databaseCreated) {
      executeSql(`DROP DATABASE ${databaseName} WITH (FORCE)`, 'postgres')
      databaseCreated = false
    }
  }

  try {
    executeSql(`CREATE DATABASE ${databaseName}`, 'postgres')
    databaseCreated = true
    await start()

    return {
      sql: executeSql,
      dispose,

      get url() {
        return apiBaseUrl
      },

      async restart() {
        await stop()
        await start()
      },
    }
  } catch (error) {
    await dispose()
    throw error
  }
}
