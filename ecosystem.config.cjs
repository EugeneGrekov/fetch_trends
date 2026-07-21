module.exports = {
  apps: [
    {
      name: 'fetch-trends-autocomplete-api',
      script: './dist/src/commands/autocomplete-api.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 20,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
