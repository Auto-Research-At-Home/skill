/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `open_research/idl/open_research.json`.
 */
export type OpenResearch = {
  "address": "ACfzPQJkUJ74bdnmvV6FmB8Me3s1cPA3ayWjt2vHRsv3",
  "metadata": {
    "name": "openResearch",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "OpenResearch: project registry, bonding-curve project tokens, proposal ledger, verifier registry"
  },
  "instructions": [
    {
      "name": "addVerifier",
      "discriminator": [
        165,
        72,
        135,
        225,
        67,
        181,
        255,
        135
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "verifierEntry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  114,
                  105,
                  102,
                  105,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "verifier"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "verifier",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "approve",
      "discriminator": [
        69,
        74,
        217,
        36,
        115,
        117,
        97,
        76
      ],
      "accounts": [
        {
          "name": "verifier",
          "writable": true,
          "signer": true
        },
        {
          "name": "verifierEntry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  114,
                  105,
                  102,
                  105,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "verifier"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "proposalId"
              }
            ]
          }
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "proposal.project_id",
                "account": "proposal"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "proposal.project_id",
                "account": "proposal"
              }
            ]
          },
          "relations": [
            "project"
          ]
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "proposal.project_id",
                "account": "proposal"
              }
            ]
          }
        },
        {
          "name": "proposalEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "proposalId"
              }
            ]
          }
        },
        {
          "name": "minerTokenAccount",
          "docs": [
            "Miner's token account, receives the returned stake."
          ],
          "writable": true
        },
        {
          "name": "rewardRecipientTokenAccount",
          "docs": [
            "Reward recipient's token account, receives the minted reward."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "proposalId",
          "type": "u64"
        },
        {
          "name": "verifiedAggregateScore",
          "type": "i64"
        },
        {
          "name": "metricsHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "buy",
      "discriminator": [
        102,
        6,
        61,
        18,
        1,
        218,
        235,
        234
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "project",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          },
          "relations": [
            "project"
          ]
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          }
        },
        {
          "name": "solVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          }
        },
        {
          "name": "buyerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "projectId",
          "type": "u64"
        },
        {
          "name": "lamportsIn",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimReview",
      "discriminator": [
        228,
        40,
        159,
        26,
        50,
        4,
        163,
        156
      ],
      "accounts": [
        {
          "name": "verifier",
          "signer": true
        },
        {
          "name": "verifierEntry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  114,
                  105,
                  102,
                  105,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "verifier"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "proposalId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "proposalId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimReward",
      "discriminator": [
        149,
        95,
        181,
        242,
        94,
        90,
        158,
        162
      ],
      "accounts": [
        {
          "name": "claimer",
          "writable": true,
          "signer": true
        },
        {
          "name": "project",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          }
        },
        {
          "name": "mint",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          },
          "relations": [
            "project"
          ]
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          }
        },
        {
          "name": "projectPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          }
        },
        {
          "name": "claimable",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              },
              {
                "kind": "account",
                "path": "claimer"
              }
            ]
          }
        },
        {
          "name": "claimerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "projectId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createProject",
      "discriminator": [
        148,
        219,
        181,
        42,
        221,
        114,
        145,
        190
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config.next_project_id",
                "account": "globalConfig"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config.next_project_id",
                "account": "globalConfig"
              }
            ]
          }
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "config.next_project_id",
                "account": "globalConfig"
              }
            ]
          }
        },
        {
          "name": "solVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config.next_project_id",
                "account": "globalConfig"
              }
            ]
          }
        },
        {
          "name": "projectPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "config.next_project_id",
                "account": "globalConfig"
              }
            ]
          }
        },
        {
          "name": "tokenMetadata",
          "docs": [
            "the metadata program and this project mint."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "metadataProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "account",
              "path": "metadataProgram"
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "metadataProgram",
          "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "createProjectArgs"
            }
          }
        }
      ]
    },
    {
      "name": "expire",
      "discriminator": [
        243,
        83,
        205,
        58,
        57,
        201,
        247,
        146
      ],
      "accounts": [
        {
          "name": "cranker",
          "writable": true,
          "signer": true
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "proposalId"
              }
            ]
          }
        },
        {
          "name": "project",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "proposal.project_id",
                "account": "proposal"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "proposal.project_id",
                "account": "proposal"
              }
            ]
          },
          "relations": [
            "project"
          ]
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "proposal.project_id",
                "account": "proposal"
              }
            ]
          }
        },
        {
          "name": "proposalEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "proposalId"
              }
            ]
          }
        },
        {
          "name": "projectPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "proposal.project_id",
                "account": "proposal"
              }
            ]
          }
        },
        {
          "name": "claimable",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "proposal.project_id",
                "account": "proposal"
              },
              {
                "kind": "account",
                "path": "cranker"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "proposalId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "reject",
      "discriminator": [
        135,
        7,
        63,
        85,
        131,
        114,
        111,
        224
      ],
      "accounts": [
        {
          "name": "verifier",
          "writable": true,
          "signer": true
        },
        {
          "name": "verifierEntry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  114,
                  105,
                  102,
                  105,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "verifier"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "proposalId"
              }
            ]
          }
        },
        {
          "name": "project",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "proposal.project_id",
                "account": "proposal"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "proposal.project_id",
                "account": "proposal"
              }
            ]
          },
          "relations": [
            "project"
          ]
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "proposal.project_id",
                "account": "proposal"
              }
            ]
          }
        },
        {
          "name": "proposalEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "proposalId"
              }
            ]
          }
        },
        {
          "name": "projectPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "proposal.project_id",
                "account": "proposal"
              }
            ]
          }
        },
        {
          "name": "claimable",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "proposal.project_id",
                "account": "proposal"
              },
              {
                "kind": "account",
                "path": "verifier"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "proposalId",
          "type": "u64"
        },
        {
          "name": "metricsHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "releaseReview",
      "discriminator": [
        138,
        118,
        154,
        93,
        97,
        183,
        59,
        219
      ],
      "accounts": [
        {
          "name": "cranker",
          "signer": true
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "proposalId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "proposalId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "removeVerifier",
      "discriminator": [
        179,
        9,
        132,
        183,
        233,
        23,
        172,
        111
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "verifierEntry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  114,
                  105,
                  102,
                  105,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "verifier"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "verifier",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "renounceAuthority",
      "discriminator": [
        78,
        110,
        117,
        127,
        89,
        23,
        253,
        153
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "sell",
      "discriminator": [
        51,
        230,
        133,
        164,
        1,
        127,
        131,
        173
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "project",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          },
          "relations": [
            "project"
          ]
        },
        {
          "name": "solVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          }
        },
        {
          "name": "sellerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "projectId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "submit",
      "discriminator": [
        88,
        166,
        102,
        181,
        162,
        127,
        170,
        48
      ],
      "accounts": [
        {
          "name": "miner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "project",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          }
        },
        {
          "name": "mint",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          },
          "relations": [
            "project"
          ]
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "config.next_proposal_id",
                "account": "globalConfig"
              }
            ]
          }
        },
        {
          "name": "proposalEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "config.next_proposal_id",
                "account": "globalConfig"
              }
            ]
          }
        },
        {
          "name": "minerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "projectId",
          "type": "u64"
        },
        {
          "name": "codeHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "benchmarkLogHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "claimedAggregateScore",
          "type": "i64"
        },
        {
          "name": "stake",
          "type": "u64"
        },
        {
          "name": "rewardRecipient",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "transferAuthority",
      "discriminator": [
        48,
        169,
        76,
        72,
        229,
        180,
        55,
        161
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newAuthority",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "claimable",
      "discriminator": [
        179,
        191,
        136,
        80,
        143,
        247,
        37,
        26
      ]
    },
    {
      "name": "globalConfig",
      "discriminator": [
        149,
        8,
        156,
        202,
        160,
        252,
        176,
        217
      ]
    },
    {
      "name": "project",
      "discriminator": [
        205,
        168,
        189,
        202,
        181,
        247,
        142,
        19
      ]
    },
    {
      "name": "proposal",
      "discriminator": [
        26,
        94,
        189,
        187,
        116,
        136,
        53,
        33
      ]
    },
    {
      "name": "solVault",
      "discriminator": [
        21,
        132,
        230,
        103,
        19,
        209,
        129,
        248
      ]
    },
    {
      "name": "verifierEntry",
      "discriminator": [
        102,
        247,
        148,
        158,
        33,
        153,
        100,
        93
      ]
    }
  ],
  "events": [
    {
      "name": "bestUpdated",
      "discriminator": [
        127,
        127,
        229,
        170,
        87,
        83,
        80,
        88
      ]
    },
    {
      "name": "bought",
      "discriminator": [
        193,
        56,
        215,
        24,
        156,
        76,
        42,
        104
      ]
    },
    {
      "name": "ledgerBurned",
      "discriminator": [
        12,
        64,
        169,
        251,
        228,
        92,
        250,
        190
      ]
    },
    {
      "name": "minerRewardMinted",
      "discriminator": [
        52,
        17,
        87,
        34,
        55,
        194,
        219,
        219
      ]
    },
    {
      "name": "ownershipTransferred",
      "discriminator": [
        172,
        61,
        205,
        183,
        250,
        50,
        38,
        98
      ]
    },
    {
      "name": "projectCreated",
      "discriminator": [
        192,
        10,
        163,
        29,
        185,
        31,
        67,
        168
      ]
    },
    {
      "name": "proposalApproved",
      "discriminator": [
        70,
        49,
        155,
        228,
        157,
        43,
        88,
        49
      ]
    },
    {
      "name": "proposalExpired",
      "discriminator": [
        48,
        8,
        10,
        52,
        213,
        133,
        166,
        223
      ]
    },
    {
      "name": "proposalRejected",
      "discriminator": [
        77,
        15,
        161,
        38,
        240,
        201,
        24,
        208
      ]
    },
    {
      "name": "proposalSubmitted",
      "discriminator": [
        36,
        127,
        215,
        177,
        143,
        187,
        90,
        147
      ]
    },
    {
      "name": "reviewClaimed",
      "discriminator": [
        44,
        85,
        35,
        249,
        196,
        143,
        65,
        45
      ]
    },
    {
      "name": "reviewReleased",
      "discriminator": [
        19,
        205,
        161,
        173,
        248,
        240,
        61,
        62
      ]
    },
    {
      "name": "rewardClaimed",
      "discriminator": [
        49,
        28,
        87,
        84,
        158,
        48,
        229,
        175
      ]
    },
    {
      "name": "sold",
      "discriminator": [
        205,
        203,
        210,
        202,
        96,
        11,
        192,
        10
      ]
    },
    {
      "name": "stakeSlashed",
      "discriminator": [
        43,
        41,
        196,
        25,
        218,
        235,
        244,
        35
      ]
    },
    {
      "name": "verifierAdded",
      "discriminator": [
        113,
        131,
        132,
        161,
        53,
        64,
        96,
        78
      ]
    },
    {
      "name": "verifierRemoved",
      "discriminator": [
        87,
        0,
        8,
        47,
        151,
        131,
        51,
        99
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Caller is not the authorized authority"
    },
    {
      "code": 6001,
      "name": "alreadyRegistered",
      "msg": "Verifier is already registered"
    },
    {
      "code": 6002,
      "name": "notRegistered",
      "msg": "Address is not a registered verifier"
    },
    {
      "code": 6003,
      "name": "notVerifier",
      "msg": "Caller is not an allowlisted verifier"
    },
    {
      "code": 6004,
      "name": "zeroAddress",
      "msg": "Address must not be zero"
    },
    {
      "code": 6005,
      "name": "unknownProject",
      "msg": "Project does not exist"
    },
    {
      "code": 6006,
      "name": "unknownProposal",
      "msg": "Proposal does not exist"
    },
    {
      "code": 6007,
      "name": "wrongStatus",
      "msg": "Proposal is in the wrong status for this action"
    },
    {
      "code": 6008,
      "name": "wrongReviewer",
      "msg": "Reviewer does not match the locked reviewer"
    },
    {
      "code": 6009,
      "name": "lockActive",
      "msg": "Review lock is still active"
    },
    {
      "code": 6010,
      "name": "lockExpired",
      "msg": "Review lock has expired"
    },
    {
      "code": 6011,
      "name": "expiryNotReached",
      "msg": "Expiry window has not been reached"
    },
    {
      "code": 6012,
      "name": "scoreNotImproved",
      "msg": "Verified score does not improve on the current best"
    },
    {
      "code": 6013,
      "name": "zeroStake",
      "msg": "Stake must be > 0"
    },
    {
      "code": 6014,
      "name": "zeroAmount",
      "msg": "Amount must be > 0"
    },
    {
      "code": 6015,
      "name": "insufficientPayment",
      "msg": "Insufficient lamports for the requested buy"
    },
    {
      "code": 6016,
      "name": "overSupply",
      "msg": "Operation would exceed mint supply"
    },
    {
      "code": 6017,
      "name": "poolCapExceeded",
      "msg": "Mint would exceed the miner pool cap"
    },
    {
      "code": 6018,
      "name": "nothingToClaim",
      "msg": "Nothing to claim"
    },
    {
      "code": 6019,
      "name": "solTransferFailed",
      "msg": "SOL transfer failed"
    },
    {
      "code": 6020,
      "name": "mathOverflow",
      "msg": "Numeric overflow"
    },
    {
      "code": 6021,
      "name": "invalidCurve",
      "msg": "Curve parameters are invalid (base_price + slope must be > 0)"
    },
    {
      "code": 6022,
      "name": "stringTooLong",
      "msg": "Token name or symbol exceeds maximum length"
    }
  ],
  "types": [
    {
      "name": "bestUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "projectId",
            "type": "u64"
          },
          {
            "name": "miner",
            "type": "pubkey"
          },
          {
            "name": "newAggregateScore",
            "type": "i64"
          },
          {
            "name": "codeHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "metricsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "bought",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "projectId",
            "type": "u64"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "lamportsSpent",
            "type": "u64"
          },
          {
            "name": "tokensOut",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "claimable",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "projectId",
            "type": "u64"
          },
          {
            "name": "account",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "createProjectArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "protocolHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "repoSnapshotHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "benchmarkHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "baselineAggregateScore",
            "type": "i64"
          },
          {
            "name": "baselineMetricsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "tokenName",
            "type": "string"
          },
          {
            "name": "tokenSymbol",
            "type": "string"
          },
          {
            "name": "basePrice",
            "type": "u64"
          },
          {
            "name": "slope",
            "type": "u64"
          },
          {
            "name": "minerPoolCap",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "globalConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "The admin who can manage the verifier allowlist. `Pubkey::default()` after `renounce`."
            ],
            "type": "pubkey"
          },
          {
            "name": "nextProjectId",
            "docs": [
              "Counter for the next project id."
            ],
            "type": "u64"
          },
          {
            "name": "nextProposalId",
            "docs": [
              "Counter for the next proposal id."
            ],
            "type": "u64"
          },
          {
            "name": "verifierCount",
            "docs": [
              "Cached verifier count for cheap reads."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "ledgerBurned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "projectId",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "minerRewardMinted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "projectId",
            "type": "u64"
          },
          {
            "name": "miner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "ownershipTransferred",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "previousOwner",
            "type": "pubkey"
          },
          {
            "name": "newOwner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "project",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "protocolHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "repoSnapshotHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "benchmarkHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "baselineAggregateScore",
            "type": "i64"
          },
          {
            "name": "baselineMetricsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "currentBestCodeHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "currentBestAggregateScore",
            "type": "i64"
          },
          {
            "name": "currentBestMetricsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "currentBestMiner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "basePrice",
            "type": "u64"
          },
          {
            "name": "slope",
            "type": "u64"
          },
          {
            "name": "minerPoolCap",
            "type": "u64"
          },
          {
            "name": "minerPoolMinted",
            "type": "u64"
          },
          {
            "name": "tokenName",
            "type": "string"
          },
          {
            "name": "tokenSymbol",
            "type": "string"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mintAuthorityBump",
            "type": "u8"
          },
          {
            "name": "solVaultBump",
            "type": "u8"
          },
          {
            "name": "projectPoolBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "projectCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "projectId",
            "type": "u64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "protocolHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "proposal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "projectId",
            "type": "u64"
          },
          {
            "name": "miner",
            "type": "pubkey"
          },
          {
            "name": "rewardRecipient",
            "type": "pubkey"
          },
          {
            "name": "codeHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "benchmarkLogHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "metricsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "claimedAggregateScore",
            "type": "i64"
          },
          {
            "name": "verifiedAggregateScore",
            "type": "i64"
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "submittedAt",
            "type": "i64"
          },
          {
            "name": "reviewLockUntil",
            "type": "i64"
          },
          {
            "name": "reviewer",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "proposalStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "escrowBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "proposalApproved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "verifier",
            "type": "pubkey"
          },
          {
            "name": "verifiedAggregateScore",
            "type": "i64"
          },
          {
            "name": "metricsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "proposalExpired",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "cranker",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "proposalRejected",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "verifier",
            "type": "pubkey"
          },
          {
            "name": "metricsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "proposalStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "inReview"
          },
          {
            "name": "approved"
          },
          {
            "name": "rejected"
          },
          {
            "name": "expired"
          }
        ]
      }
    },
    {
      "name": "proposalSubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "projectId",
            "type": "u64"
          },
          {
            "name": "miner",
            "type": "pubkey"
          },
          {
            "name": "rewardRecipient",
            "type": "pubkey"
          },
          {
            "name": "codeHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "claimedAggregateScore",
            "type": "i64"
          },
          {
            "name": "stake",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "reviewClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "verifier",
            "type": "pubkey"
          },
          {
            "name": "reviewLockUntil",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "reviewReleased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "rewardClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "projectId",
            "type": "u64"
          },
          {
            "name": "account",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "solVault",
      "docs": [
        "A program-owned PDA whose only purpose is to hold lamports for the bonding-curve reserves."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "projectId",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "sold",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "projectId",
            "type": "u64"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "tokensIn",
            "type": "u64"
          },
          {
            "name": "lamportsOut",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "stakeSlashed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "beneficiary",
            "type": "pubkey"
          },
          {
            "name": "toVerifierPool",
            "type": "u64"
          },
          {
            "name": "burned",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "verifierAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "verifier",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "verifierEntry",
      "docs": [
        "Marker PDA. Existence ⇒ this verifier is allowlisted."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "verifier",
            "type": "pubkey"
          },
          {
            "name": "addedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "verifierRemoved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "verifier",
            "type": "pubkey"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "bpsDenominator",
      "type": "u16",
      "value": "10000"
    },
    {
      "name": "claimableSeed",
      "type": "bytes",
      "value": "[99, 108, 97, 105, 109]"
    },
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "expiryWindow",
      "docs": [
        "7 days, in seconds."
      ],
      "type": "i64",
      "value": "604800"
    },
    {
      "name": "mintAuthoritySeed",
      "type": "bytes",
      "value": "[109, 105, 110, 116, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    },
    {
      "name": "mintSeed",
      "type": "bytes",
      "value": "[109, 105, 110, 116]"
    },
    {
      "name": "projectPoolSeed",
      "type": "bytes",
      "value": "[112, 111, 111, 108]"
    },
    {
      "name": "projectSeed",
      "type": "bytes",
      "value": "[112, 114, 111, 106, 101, 99, 116]"
    },
    {
      "name": "proposalEscrowSeed",
      "type": "bytes",
      "value": "[112, 114, 111, 112, 111, 115, 97, 108, 95, 101, 115, 99, 114, 111, 119]"
    },
    {
      "name": "proposalSeed",
      "type": "bytes",
      "value": "[112, 114, 111, 112, 111, 115, 97, 108]"
    },
    {
      "name": "reviewLock",
      "docs": [
        "24 hours, in seconds."
      ],
      "type": "i64",
      "value": "86400"
    },
    {
      "name": "slashBpsToBurn",
      "docs": [
        "Portion of slashed stake permanently burned."
      ],
      "type": "u16",
      "value": "5000"
    },
    {
      "name": "slashBpsToVerifierPool",
      "docs": [
        "Portion of slashed stake transferred to the verifier-pool / cranker (claimable)."
      ],
      "type": "u16",
      "value": "5000"
    },
    {
      "name": "solVaultSeed",
      "type": "bytes",
      "value": "[115, 111, 108, 95, 118, 97, 117, 108, 116]"
    },
    {
      "name": "verifierSeed",
      "type": "bytes",
      "value": "[118, 101, 114, 105, 102, 105, 101, 114]"
    }
  ]
};
