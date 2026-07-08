# Repositories

This directory contains persistence adapters for individual SQLite tables and record groups.

Repository modules should:

- hide SQL details from command and domain layers
- accept explicit database connections
- keep serialization behavior deterministic
- be covered by repository or integration tests when schema behavior changes
