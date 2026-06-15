CREATE TABLE mcp_servers (
    name        VARCHAR(64)  NOT NULL,
    url         VARCHAR(500) NOT NULL,
    auth_token  VARCHAR(500) NOT NULL DEFAULT '',
    enabled     TINYINT(1)   NOT NULL DEFAULT 1,
    description VARCHAR(500) NOT NULL DEFAULT '',
    last_synced DATETIME     NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mcp_functions (
    server_name VARCHAR(64)  NOT NULL,
    name        VARCHAR(128) NOT NULL,
    description TEXT,
    schema_json JSON         NOT NULL,
    enabled     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (server_name, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
