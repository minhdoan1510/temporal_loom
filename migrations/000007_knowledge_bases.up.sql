CREATE TABLE knowledge_bases (
    id            VARCHAR(36)  PRIMARY KEY,
    name          VARCHAR(255) NOT NULL UNIQUE,
    collection    VARCHAR(255) NOT NULL UNIQUE,
    source        VARCHAR(50)  NOT NULL DEFAULT 'confluence',
    space_key     VARCHAR(100) NOT NULL,
    root_page     VARCHAR(500) NOT NULL,
    chunk_size    INT          NOT NULL DEFAULT 1000,
    chunk_overlap INT          NOT NULL DEFAULT 200,
    status        VARCHAR(20)  NOT NULL DEFAULT 'idle',
    error_msg     TEXT,
    total_pages   INT          NOT NULL DEFAULT 0,
    total_chunks  INT          NOT NULL DEFAULT 0,
    total_points  INT          NOT NULL DEFAULT 0,
    last_synced   DATETIME,
    created_by    VARCHAR(255),
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
