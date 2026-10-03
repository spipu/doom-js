/**
 * The known IWAD files by the SHA-1 of the whole file: the title and version
 * a stored WAD displays. Commercial hashes transcribed from the Doom Wiki
 * pages DOOM.WAD, DOOM1.WAD, DOOM2.WAD, PLUTONIA.WAD, TNT.WAD, HERETIC.WAD,
 * HEXEN.WAD and HEXDD.WAD; Freedoom hashes computed on the files of each
 * GitHub release (github.com/freedoom/freedoom/releases). Release order from
 * the same pages, console ports placed by their release year.
 */
class DoomWadEditions {
    /**
     * @param {string|null} sha1 - lowercase hexadecimal SHA-1 of the file
     * @returns {{name: string, version: string, rank: int}|null} null for an unknown file;
     *          within a name, a higher rank is a later release
     */
    static describe(sha1) {
        if (sha1 === null) {
            return null;
        }

        return (DoomWadEditions.TABLE[sha1] ?? null);
    }

    // releases: oldest first, the files of one entry sharing their rank.
    static _game(name, releases) {
        return Object.fromEntries(releases.flatMap((files, rank) => Object.entries(files)
            .map(([sha1, version]) => [sha1, {name: name, version: version, rank: rank}])));
    }
}

DoomWadEditions.TABLE = Object.assign({},
    DoomWadEditions._game('Doom 1 - Shareware', [
        {'fc0359e191bd257b3507863ae412ef3250515866': '1.0'},
        {'9a24a7093ea0e78fd85f9923e55c55e79491b6a1': '1.1'},
        {'d4dc6806abd96bd93570c8df436fb6956e13d910': '1.1'},
        {'eaa66abb5e0b9c22f2f314b6599dcee871f57ed7': '1.2'},
        {'77ef34de7f13dc36b792fb82ed6805e9c1dc7afc': '1.2'},
        {'72caf585f7ce56861d25f8580c1cc82bf50abd1b': '1.25'},
        {'b4a8e93f1f9544210a173035a0b04c19eb283a2a': '1.4'},
        {'b559ba93d0a96e242eb6ded9deeedbd6f79d40fc': '1.5'},
        {'1437fc1ac25a17d5b3cef4c9d2f74e40cae3d231': '1.6'},
        {'81535778d0d4c0c7aa8616fbfd3607dfb3dfd643': '1.666'},
        {'c6612ac5a8ac2e2a1d707f9b2869af820efb7c50': '1.8'},
        {'5b2e249b9c5133ec987b3ea77596381dc0d6bc1d': '1.9'}
    ]),
    DoomWadEditions._game('Doom 1', [
        {'df0040ccb29cc1622e74ceb3b7793a2304cca2c8': '1.1'},
        {'b5f86a559642a2b3bdfb8a75e91c8da97f057fe6': '1.2'},
        {'2e89b86859acd9fc1e552f587b710751efcffa8e': '1.666'},
        {'2c8212631b37f21ad06d18b5638c733a75e179ff': '1.8'},
        {'7742089b4468a736cadb659a7deca3320fe6dcbd': '1.9'},
        {'23a3a8bfafcfdc7c481f282cf2a3d03e5f386d43': 'Pocket PC'}
    ]),
    DoomWadEditions._game('Doom 1 - Ultimate', [
        {'9b07b02ab3c275a6a7570c3f73cc20d63a0e3833': '1.9'},
        {'1d1d4f69fe14fa255228d8243470678b1b4efdc5': 'Xbox'},
        {'37de4510216eb3ce9a835dd939109443375d10c5': 'XBLA'},
        {'117015379c529573510be08cf59810aa10bb934e': 'BFG Edition (PS3)'},
        {
            'd6a9f0172eca101471128ec61be975361f2ad28e': 'BFG Edition (Xbox 360)',
            'e5ec79505530e151ff0e6f517f3ce1fd65969c46': 'BFG Edition'
        },
        {'f770111ca9eb6d49aead51fcbd398719b462e64b': 'Unity 1.0'},
        {'08ab2507e1d525c4c06b6df4f6d5862568a6b009': 'Unity 1.1'},
        {'2a8a1ce0f29497a2781b2902c76115fd60d8bbf8': 'Unity 1.3'},
        {'997bae5e5a190c5bb3b1fb9e7e3e75b2da88cb27': 'Doom + Doom II (2024-08)'},
        {'87651324502044f9a6eed403e48853aa16c93e49': 'Doom + Doom II (2024-10)'}
    ]),
    DoomWadEditions._game('Doom 2', [
        {
            'a4ce5128d57cb129fdd1441c12b58245be55c8ce': '1.666g',
            '6d559b7ceece4f5ad457415049711992370d520a': '1.666'
        },
        {'78009057420b792eacff482021db6fe13b370dcc': '1.7'},
        {'70192b8d5aba65c7e633a7c7bcfe7e3e90640c97': '1.7a'},
        {'d510c877031bbd5f3d198581a2c8651e09b9861f': '1.8f1'},
        {'79c283b18e61b9a989cfd3e0f19a42ea98fda551': '1.8'},
        {
            '7ec7652fcfce8ddc6e801839291f0e28ef1d5ae7': '1.9',
            'c78e5f516eb8f26aafd6e487aab3e7323b672fb6': '1.9 (PC-98)'
        },
        {'2cda310805397ae44059bbcaed3cd602f4864a82': 'Tapwave Zodiac'},
        {'1c91d86cd8a2f3817227986503a6672a5e1613f0': 'Xbox (Resurrection of Evil)'},
        {
            'ca8db908a7c9fbac764f34c148f0bcc78d18553e': 'PSN (US)',
            'f1b6ba94352d53f646b67c01d2da88c5c40e3179': 'PSN (EU)'
        },
        {'55e445badd63d8841ebea887910c26c62c7f525e': 'XBLA'},
        {
            'b7ba1c68631023ea1aab1d7b9f7f6e9afc508f39': 'BFG Edition (Xbox 360, PS3)',
            'a59548125f59f6aa1a41c22f615557d3dd2e85a9': 'BFG Edition'
        },
        {'9b39107b5bcfd1f989bcfe46f68dbc1f49222922': 'Unity 1.0'},
        {'b723882122e90b61a1d92a11dcfcf9cbf95a407e': 'Unity 1.1'},
        {'9574851209c9dfbede56db0dee0660ecd51e6150': 'Unity 1.3'},
        {'c745f04a6abc2e6d2a2d52382f45500dd2a260be': 'Doom + Doom II (2024-08)'},
        {'2921cf667359fd3a80aba3c0cf62ab39297e7e9e': 'Doom + Doom II (2024-10)'}
    ]),
    DoomWadEditions._game('Doom 2 - Plutonia', [
        {'90361e2a538d2388506657252ae41aceeb1ba360': '1.9'},
        {'f131cbe1946d7fddb3caec4aa258c83399c21e60': '1.9 (Anthology)'},
        {
            '327f8c41ebd4138354e9fca63cebbbd1b9489749': 'PSN (US)',
            '85c3517434135a5886111b324955f9288c01046c': 'PSN (EU)'
        },
        {'54e27b5791fbc5677bf7e83c1de3a92ea3ef935b': 'Unity (2019)'},
        {'20fd23ee410c466b263a741bbd53bbef573ab47d': 'Unity (2020)'},
        {'816c7c6b0098f66c299c9253f62bd908456efb63': 'Doom + Doom II (2024-08)'},
        {'fbcc140825b507ab88d844c6b1635c60c4b8bcd6': 'Doom + Doom II (2024-10)'}
    ]),
    DoomWadEditions._game('Doom 2 - TNT Evilution', [
        {'9fbc66aedef7fe3bae0986cdb9323d2b8db4c9d3': '1.9'},
        {'4a65c8b960225505187c36040b41a40b152f8f3e': '1.9 (Anthology)'},
        {
            '139e26d801a64b404b8d898defca10227a61867b': 'PSN (US)',
            '5066833da047117241cdda05a708b009eb266c91': 'PSN (EU)'
        },
        {'503271390606ebded04a2cfaa1a4e249c0313a9d': 'Unity (2019)'},
        {'ca0f0495a6c2813b49620202774c56560d6d7621': 'Unity (2020)'},
        {'9820e2a3035f0cdd87f69a7d57c59a7a267c9409': 'Doom + Doom II (2024-08)'},
        {'ab4e71e360a1e64e262d77a53e4bb202450d0f6e': 'Doom + Doom II (2024-10)'}
    ]),
    DoomWadEditions._game('Freedoom - Phase 1', [
        {'36db0eb476486fa56c43f24d9b23e9d8afdbbff5': '0.11.3'},
        {'351a207b5fe520ea618bc8659d176f4c39047d20': '0.12.0'},
        {'e9bf428b73a04423ea7a0e9f4408f71df85ab175': '0.12.1'},
        {'97bb88094a51457a8dcad98c58be22a2d0fa9a37': '0.13.0'}
    ]),
    DoomWadEditions._game('Freedoom - Phase 2', [
        {'0c03d1f754b98c53f292f66bc9505a29f47c6a9f': '0.11.3'},
        {'18c6ef3f269a80feed16eb46c7577d29d4209098': '0.12.0'},
        {'51c997f430dc12abba7888c2d83c237a8e0758a7': '0.12.1'},
        {'975f781e6d801c0a23e3caa33f70493efe68a880': '0.13.0'}
    ]),
    DoomWadEditions._game('Freedoom - FreeDM', [
        {'7e979209685ff81f4d709e0926ba585a37d2e35a': '0.11.3'},
        {'3ea8429890c3fe5455783575598d52ff4a72758d': '0.12.0'},
        {'61065a41a391cd2e4bff69488be36773754354ab': '0.12.1'},
        {'42c36e9d0610bf70c710ca79c7098ef3b1b00059': '0.13.0'}
    ]),
    DoomWadEditions._game('Heretic', [
        {'b5a6cc79cde48d97905b44282e82c4c966a23a87': '1.0'},
        {'a54c5d30629976a649119c5ce8babae2ddfb1a60': '1.2'},
        {'f489d479371df32f6d280a0cb23b59a35ba2b833': '1.3'},
        {'1c74bbb19ac0609573a898b40b6f022ccb25d07e': '2.1'},
        {'2777df44be015ba6549bfb49f3218657fe604b16': '2.2'},
        {'1dcb96a2c8a41dcb7c26bab4c58b66a3578a1ee0': '2.3'}
    ]),
    DoomWadEditions._game('Hexen', [
        {'ae797f5fdce845be24a7a24dd5bfc3e762a17bbe': 'Beta'},
        {'ac129c4331bf26f0f080c4a56aaa40d64969c98a': '1.0'},
        {
            '4b53832f0733c1e29e5f1de2428e5475e891af29': '1.1',
            '4343fbe5aef905ef6d077a1517a50c919e5cc906': 'Mac'
        },
        {'a2ee5bc0ac7d9249d8570dc2ee85dd74d2f29936': '2.1'},
        {'0b0bdcf11ac69439ea4e410a003c80f7f6befd98': '2.2'},
        {'14590df66990c1143582733335c50df0556be487': '2.3'}
    ]),
    DoomWadEditions._game('Hexen - Demo', [
        {'f1015d659329733a237c00f2c6208243fa95e2f7': 'Beta'},
        {
            'fa89a2475855e43c7f7e3198d6e4c4bee23bfab9': '1.0',
            'c2338e52c06c3a4925b9a9fb2c720252fe917c08': 'Mac'
        }
    ]),
    DoomWadEditions._game('Hexen - Deathkings', [
        {'c3065527d62b05a930fe75fe8181a64fb1982976': '1.0'},
        {'081f6a2024643b54ef4a436a85508539b6d20a1e': '1.1'},
        {'a20c58783cb082b3af1102631176d704061df320': '2.1'},
        {'daf55c6606e1229de6e244acecf4c0ee7ee93e0b': '2.2'}
    ])
);
